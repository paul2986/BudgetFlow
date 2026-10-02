-- Admin overview: app-wide numbers for the admin panel in Settings.
--
-- private.admins   who counts as an admin. Not reachable through the API; rows
--                  are added by hand in the SQL editor (there is no in-app way
--                  to grant it):
--                    insert into private.admins (user_id)
--                    select id from auth.users where email = '<their email>';
-- is_admin()       whether the caller is one, so the app knows to show the panel.
-- admin_overview() the numbers, as one JSON object. Counts and timestamps only:
--                  no budget names, descriptions, amounts or people's names ever
--                  leave the database through it. It checks is_admin() itself,
--                  so hiding the panel in the app is only a courtesy.
--
-- Admins get no extra read access to any table; row-level security is unchanged.

create table private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.admins enable row level security;
revoke all on private.admins from public, anon, authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.admins where user_id = (select auth.uid()));
$$;

create function public.admin_overview()
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

  return jsonb_build_object(
    'generated_at', now(),

    'users', (
      select jsonb_build_object(
        'total', count(*),
        'confirmed', count(*) filter (where email_confirmed_at is not null),
        'unconfirmed', count(*) filter (where email_confirmed_at is null),
        'signups_7d', count(*) filter (where created_at > now() - interval '7 days'),
        'signups_30d', count(*) filter (where created_at > now() - interval '30 days'),
        -- Only each budget's last editor is recorded, so this undercounts when
        -- several people edit one budget in the window.
        'active_editors_7d', (
          select count(distinct updated_by) from public.budgets
          where updated_at > now() - interval '7 days'
        ),
        'active_editors_30d', (
          select count(distinct updated_by) from public.budgets
          where updated_at > now() - interval '30 days'
        )
      )
      from auth.users
    ),

    'budgets', (
      with member_counts as (
        select budget_id, count(*) as n from public.budget_members group by budget_id
      )
      select jsonb_build_object(
        'total', count(*),
        'solo', count(*) filter (where coalesce(m.n, 0) <= 1),
        'shared', count(*) filter (where m.n > 1),
        'avg_members', round(coalesce(avg(coalesce(m.n, 0)), 0)::numeric, 2),
        'created_7d', count(*) filter (where b.created_at > now() - interval '7 days'),
        'created_30d', count(*) filter (where b.created_at > now() - interval '30 days'),
        'edited_7d', count(*) filter (where b.updated_at > now() - interval '7 days'),
        'edited_30d', count(*) filter (where b.updated_at > now() - interval '30 days'),
        'dormant_30d', count(*) filter (where b.updated_at <= now() - interval '30 days'),
        'invites_pending', (
          select count(*) from public.budget_invites where accepted_at is null and expires_at > now()
        ),
        'invites_accepted', (
          select count(*) from public.budget_invites where accepted_at is not null
        ),
        'invites_expired', (
          select count(*) from public.budget_invites where accepted_at is null and expires_at <= now()
        )
      )
      from public.budgets b
      left join member_counts m on m.budget_id = b.id
    ),

    -- The budget documents are client-written JSON, so count their arrays
    -- defensively and report only values from a fixed list.
    'content', (
      with per_budget as (
        select
          case when jsonb_typeof(data -> 'expenses') = 'array' then jsonb_array_length(data -> 'expenses') else 0 end as expenses,
          case when jsonb_typeof(data -> 'people') = 'array' then jsonb_array_length(data -> 'people') else 0 end as people
        from public.budgets
      )
      select jsonb_build_object(
        'expenses', coalesce(sum(expenses), 0),
        'people', coalesce(sum(people), 0),
        'median_expenses_per_budget', round(coalesce(percentile_cont(0.5) within group (order by expenses), 0)::numeric, 1),
        'max_expenses_per_budget', coalesce(max(expenses), 0),
        'expenses_by_frequency', (
          select coalesce(jsonb_object_agg(frequency, n), '{}'::jsonb)
          from (
            select
              case when e ->> 'frequency' in ('daily', 'weekly', 'monthly', 'yearly', 'one-time')
                then e ->> 'frequency' else 'other' end as frequency,
              count(*) as n
            from public.budgets b
            cross join lateral jsonb_array_elements(
              case when jsonb_typeof(b.data -> 'expenses') = 'array' then b.data -> 'expenses' else '[]'::jsonb end
            ) as e
            group by 1
          ) by_frequency
        )
      )
      from per_budget
    ),

    'health', jsonb_build_object(
      -- Every sync sends the whole budget, so the biggest one is the worst case.
      'largest_budget_bytes', (select coalesce(max(octet_length(data::text)), 0) from public.budgets),
      -- Accounts whose old-format copy still holds budgets: devices that haven't
      -- updated. When this is 0, user_data can be dropped.
      'legacy_user_data_with_budgets', (
        select count(*) from public.user_data
        where jsonb_typeof(app_data -> 'budgets') = 'array' and jsonb_array_length(app_data -> 'budgets') > 0
      ),
      -- Should always be 0: the database hands a budget on or deletes it.
      'budgets_without_owner', (
        select count(*) from public.budgets b
        where not exists (
          select 1 from public.budget_members m where m.budget_id = b.id and m.role = 'owner'
        )
      )
    )
  );
end;
$$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_overview() to authenticated;
