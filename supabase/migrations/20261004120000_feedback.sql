-- Feedback: people send ideas and suggestions from Settings; admins triage them,
-- reply, and set a status. The sender sees the status and replies in the app and
-- can answer back.
--
-- feedback           one row per idea: the first message, its status, and who sent it.
-- feedback_messages  the replies after that, from either side.
--
-- Nobody reads or writes these tables directly (row-level security is on with no
-- policies, and every grant is revoked). Everything goes through the functions
-- below, which run with definer rights:
--   * User functions only ever touch the caller's own rows, and never return an
--     author id, so a sender can't tell which admin replied.
--   * Admin functions start with is_admin(), like admin_overview(), so hiding the
--     screens in the app is only a courtesy. Admins get no extra table access.
--   * A sender's email reaches an admin only when they ticked "share my email";
--     otherwise the admin functions never look it up. Unshared is not anonymous:
--     the row still has a user_id, so the sender's own thread keeps working.
--
-- Deleting an account deletes its feedback with it.
--
-- Read markers, so neither side needs aggregates:
--   needs you  = the sender has written since an admin last replied or set a status
--   unread     = an admin has replied or set a status since the sender last looked

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body, E' \t\r\n')) between 1 and 2000),
  status text not null default 'new' check (status in ('new', 'backlog', 'planned', 'done', 'rejected')),
  share_email boolean not null default false,
  app_version text check (char_length(app_version) <= 50),
  platform text check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_activity_at timestamptz not null default now(),
  admin_activity_at timestamptz,
  admin_handled_at timestamptz,
  user_seen_at timestamptz
);
create index feedback_user_id_idx on public.feedback (user_id);
create index feedback_status_idx on public.feedback (status);

create table public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback (id) on delete cascade,
  from_admin boolean not null,
  body text not null check (char_length(btrim(body, E' \t\r\n')) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index feedback_messages_feedback_id_idx on public.feedback_messages (feedback_id, created_at);

alter table public.feedback enable row level security;
alter table public.feedback_messages enable row level security;
revoke all on public.feedback, public.feedback_messages from public, anon, authenticated;

-- One admin-facing view of an item, optionally with its thread. The email is only
-- looked up for items whose sender chose to share it. Not callable from the API:
-- the functions below check is_admin() before they use it.
create function private.feedback_admin_json(p_id uuid, p_with_messages boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', f.id,
    'body', f.body,
    'status', f.status,
    'created_at', f.created_at,
    'updated_at', f.updated_at,
    'last_activity_at', greatest(f.user_activity_at, f.admin_activity_at),
    'needs_you', f.user_activity_at > coalesce(f.admin_handled_at, '-infinity'::timestamptz),
    'message_count', (select count(*) from public.feedback_messages m where m.feedback_id = f.id),
    'app_version', f.app_version,
    'platform', f.platform,
    'sender_email', u.email
  ) || case when p_with_messages then jsonb_build_object(
    'messages', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('id', m.id, 'from_admin', m.from_admin, 'body', m.body, 'created_at', m.created_at)
          order by m.created_at, m.id
        ),
        '[]'::jsonb
      )
      from public.feedback_messages m
      where m.feedback_id = f.id
    )
  ) else '{}'::jsonb end
  from public.feedback f
  left join auth.users u on u.id = f.user_id and f.share_email
  where f.id = p_id;
$$;
revoke execute on function private.feedback_admin_json(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The sender's side
-- ---------------------------------------------------------------------------

-- Send an idea. At most 5 an hour (SQLSTATE 54000, which the app turns into a
-- friendly message).
create function public.submit_feedback(
  p_body text,
  p_share_email boolean default false,
  p_app_version text default null,
  p_platform text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''), E' \t\r\n');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'Feedback must be between 1 and 2000 characters' using errcode = '22023';
  end if;
  if (
    select count(*) from public.feedback
    where user_id = v_uid and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Too much feedback just now' using errcode = '54000';
  end if;

  insert into public.feedback (user_id, body, share_email, app_version, platform)
  values (
    v_uid,
    v_body,
    coalesce(p_share_email, false),
    left(p_app_version, 50),
    case when p_platform in ('ios', 'android', 'web') then p_platform end
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- The caller's own feedback, newest activity first, with each thread. Admin
-- messages are marked from_admin and carry no author.
create function public.my_feedback()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(item.json order by item.sort_at desc, item.id), '[]'::jsonb)
    from (
      select
        f.id,
        greatest(f.created_at, f.user_activity_at, f.admin_activity_at) as sort_at,
        jsonb_build_object(
          'id', f.id,
          'body', f.body,
          'status', f.status,
          'share_email', f.share_email,
          'created_at', f.created_at,
          'updated_at', f.updated_at,
          'unread', coalesce(f.admin_activity_at > coalesce(f.user_seen_at, '-infinity'::timestamptz), false),
          'messages', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object('id', m.id, 'from_admin', m.from_admin, 'body', m.body, 'created_at', m.created_at)
                order by m.created_at, m.id
              ),
              '[]'::jsonb
            )
            from public.feedback_messages m
            where m.feedback_id = f.id
          )
        ) as json
      from public.feedback f
      where f.user_id = v_uid
    ) item
  );
end;
$$;

-- How many of the caller's items have an admin reply or status change they haven't seen.
create function public.my_feedback_unread()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return (
    select count(*)::integer from public.feedback f
    where f.user_id = v_uid
      and f.admin_activity_at > coalesce(f.user_seen_at, '-infinity'::timestamptz)
  );
end;
$$;

-- The caller has read an item's thread. Quietly does nothing for anyone else's.
create function public.mark_feedback_seen(p_feedback_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.feedback set user_seen_at = now()
  where id = p_feedback_id and user_id = v_uid;
end;
$$;

-- A follow-up on the caller's own item. At most 20 an hour, so a real back and
-- forth fits but a loop doesn't.
create function public.reply_to_feedback(p_feedback_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''), E' \t\r\n');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform 1 from public.feedback where id = p_feedback_id and user_id = v_uid for update;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'Messages must be between 1 and 2000 characters' using errcode = '22023';
  end if;
  if (
    select count(*) from public.feedback_messages m
    join public.feedback f on f.id = m.feedback_id
    where f.user_id = v_uid and not m.from_admin and m.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'Too many messages just now' using errcode = '54000';
  end if;

  insert into public.feedback_messages (feedback_id, from_admin, body)
  values (p_feedback_id, false, v_body)
  returning id into v_id;
  update public.feedback set user_activity_at = now(), updated_at = now() where id = p_feedback_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The admin's side. Every function starts by checking is_admin().
-- ---------------------------------------------------------------------------

-- The inbox, most recent activity first (at most 200). Filter by status, or to
-- what is waiting on you.
create function public.admin_feedback_list(p_status text default null, p_needs_you boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('new', 'backlog', 'planned', 'done', 'rejected') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;

  return (
    select coalesce(jsonb_agg(private.feedback_admin_json(page.id, false) order by page.sort_at desc, page.id), '[]'::jsonb)
    from (
      select f.id, greatest(f.created_at, f.user_activity_at, f.admin_activity_at) as sort_at
      from public.feedback f
      where (p_status is null or f.status = p_status)
        and (not coalesce(p_needs_you, false) or f.user_activity_at > coalesce(f.admin_handled_at, '-infinity'::timestamptz))
      order by sort_at desc, f.id
      limit 200
    ) page
  );
end;
$$;

-- One item with its thread.
create function public.admin_feedback_get(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_item := private.feedback_admin_json(p_id, true);
  if v_item is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return v_item;
end;
$$;

-- Reply, and optionally set the status in the same step ("shipped, thanks" + done).
create function public.admin_feedback_reply(p_id uuid, p_body text, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''), E' \t\r\n');
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('new', 'backlog', 'planned', 'done', 'rejected') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'Messages must be between 1 and 2000 characters' using errcode = '22023';
  end if;
  perform 1 from public.feedback where id = p_id for update;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;

  insert into public.feedback_messages (feedback_id, from_admin, body) values (p_id, true, v_body);
  update public.feedback
  set status = coalesce(p_status, status),
      admin_activity_at = now(),
      admin_handled_at = now(),
      updated_at = now()
  where id = p_id;
  return private.feedback_admin_json(p_id, true);
end;
$$;

-- Change the status without a reply (triage). The sender sees the new status.
create function public.admin_feedback_set_status(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('new', 'backlog', 'planned', 'done', 'rejected') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;

  update public.feedback
  set status = p_status,
      admin_activity_at = now(),
      admin_handled_at = now(),
      updated_at = now()
  where id = p_id;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return private.feedback_admin_json(p_id, true);
end;
$$;

-- Numbers for the badges and the filter pills.
create function public.admin_feedback_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'total', count(*),
      'needs_you', count(*) filter (where user_activity_at > coalesce(admin_handled_at, '-infinity'::timestamptz)),
      'new', count(*) filter (where status = 'new'),
      'backlog', count(*) filter (where status = 'backlog'),
      'planned', count(*) filter (where status = 'planned'),
      'done', count(*) filter (where status = 'done'),
      'rejected', count(*) filter (where status = 'rejected')
    )
    from public.feedback
  );
end;
$$;

revoke execute on function public.submit_feedback(text, boolean, text, text) from public, anon;
revoke execute on function public.my_feedback() from public, anon;
revoke execute on function public.my_feedback_unread() from public, anon;
revoke execute on function public.mark_feedback_seen(uuid) from public, anon;
revoke execute on function public.reply_to_feedback(uuid, text) from public, anon;
revoke execute on function public.admin_feedback_list(text, boolean) from public, anon;
revoke execute on function public.admin_feedback_get(uuid) from public, anon;
revoke execute on function public.admin_feedback_reply(uuid, text, text) from public, anon;
revoke execute on function public.admin_feedback_set_status(uuid, text) from public, anon;
revoke execute on function public.admin_feedback_counts() from public, anon;

grant execute on function public.submit_feedback(text, boolean, text, text) to authenticated;
grant execute on function public.my_feedback() to authenticated;
grant execute on function public.my_feedback_unread() to authenticated;
grant execute on function public.mark_feedback_seen(uuid) to authenticated;
grant execute on function public.reply_to_feedback(uuid, text) to authenticated;
grant execute on function public.admin_feedback_list(text, boolean) to authenticated;
grant execute on function public.admin_feedback_get(uuid) to authenticated;
grant execute on function public.admin_feedback_reply(uuid, text, text) to authenticated;
grant execute on function public.admin_feedback_set_status(uuid, text) to authenticated;
grant execute on function public.admin_feedback_counts() to authenticated;
