-- Shared budgets: each budget becomes its own JSON document with a member list,
-- so separate accounts can share one budget.
--
-- budgets         one row per budget; `data` is the Budget JSON the app already
--                 uses, and `revision` drives the same conditional-write sync
--                 that user_data uses.
-- budget_members  who can open a budget. Exactly one owner; everyone else is an
--                 editor. Owners invite, remove people and delete the budget.
-- budget_invites  single-use invite links, created by the owner and accepted
--                 through accept_budget_invite().
--
-- user_data stays for per-account settings (active budget). The budgets in it
-- are copied here; updated clients then drop them from user_data.

-- Membership checks run with definer rights so policies on budget_members can
-- ask about budget_members without recursing. They live outside the API schema.
create schema if not exists private;

create table public.budgets (
  id text primary key check (char_length(id) between 1 and 100),
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.budget_members (
  budget_id text not null references public.budgets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  joined_at timestamptz not null default now(),
  primary key (budget_id, user_id)
);
create index budget_members_user_id_idx on public.budget_members (user_id);
create unique index budget_members_one_owner on public.budget_members (budget_id) where role = 'owner';

create table public.budget_invites (
  token uuid primary key default gen_random_uuid(),
  budget_id text not null references public.budgets (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);
create index budget_invites_budget_id_idx on public.budget_invites (budget_id);

create function private.is_budget_member(p_budget_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.budget_members
    where budget_id = p_budget_id and user_id = (select auth.uid())
  );
$$;

create function private.is_budget_owner(p_budget_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.budget_members
    where budget_id = p_budget_id and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_budget_member(text) to authenticated;
grant execute on function private.is_budget_owner(text) to authenticated;

-- Revision, updated_at and updated_by are set by the database, never trusted from clients.
create function public.budgets_bump_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

create trigger budgets_bump_revision
  before insert or update on public.budgets
  for each row execute function public.budgets_bump_revision();

-- When a member goes (they left, were removed, or their account was deleted):
-- a budget nobody belongs to is deleted, and a budget that lost its owner is
-- handed to the longest-standing remaining member.
create function private.budget_members_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.budget_members where budget_id = old.budget_id) then
    delete from public.budgets where id = old.budget_id;
  elsif old.role = 'owner' then
    update public.budget_members set role = 'owner'
    where (budget_id, user_id) = (
      select budget_id, user_id from public.budget_members
      where budget_id = old.budget_id
      order by joined_at, user_id
      limit 1
    );
  end if;
  return null;
end;
$$;

create trigger budget_members_after_delete
  after delete on public.budget_members
  for each row execute function private.budget_members_after_delete();

-- Row-level security. Creating budgets and joining them go through the
-- functions below, so neither table takes direct inserts.
alter table public.budgets enable row level security;
alter table public.budget_members enable row level security;
alter table public.budget_invites enable row level security;

create policy "Members can read their budgets" on public.budgets
  for select to authenticated using ((select private.is_budget_member(id)));
create policy "Members can update their budgets" on public.budgets
  for update to authenticated
  using ((select private.is_budget_member(id)))
  with check ((select private.is_budget_member(id)));
create policy "Owners can delete their budgets" on public.budgets
  for delete to authenticated using ((select private.is_budget_owner(id)));

create policy "Members can see who shares their budgets" on public.budget_members
  for select to authenticated using ((select private.is_budget_member(budget_id)));
create policy "Members can leave; owners can remove people" on public.budget_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_budget_owner(budget_id)));

create policy "Owners can see their budgets' invites" on public.budget_invites
  for select to authenticated using ((select private.is_budget_owner(budget_id)));
create policy "Owners can create invites" on public.budget_invites
  for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.is_budget_owner(budget_id)));
create policy "Owners can revoke invites" on public.budget_invites
  for delete to authenticated using ((select private.is_budget_owner(budget_id)));

revoke all on public.budgets, public.budget_members, public.budget_invites from anon, authenticated;
grant select, delete on public.budgets to authenticated;
grant update (data) on public.budgets to authenticated;
grant select, delete on public.budget_members to authenticated;
grant select, delete on public.budget_invites to authenticated;
grant insert (budget_id, created_by) on public.budget_invites to authenticated;

-- Create a budget with the caller as its owner. Returns the new revision.
create function public.create_budget(p_id text, p_data jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_revision bigint;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.budgets (id, data) values (p_id, p_data) returning revision into v_revision;
  insert into public.budget_members (budget_id, user_id, role) values (p_id, v_uid, 'owner');
  return v_revision;
end;
$$;

-- What an invite is for, so the app can ask "Join <budget>?" before accepting.
create function public.get_budget_invite(p_token uuid)
returns table (budget_id text, budget_name text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.budget_id,
    b.data->>'name',
    case
      when i.accepted_at is not null then 'used'
      when i.expires_at < now() then 'expired'
      else 'valid'
    end
  from public.budget_invites i
  join public.budgets b on b.id = i.budget_id
  where i.token = p_token and (select auth.uid()) is not null;
$$;

-- Join a budget with an invite. Single use; joining a budget you're already in
-- succeeds without using the invite up. Returns the budget id.
create function public.accept_budget_invite(p_token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.budget_invites;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into v_invite from public.budget_invites where token = p_token for update;
  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.budget_members where budget_id = v_invite.budget_id and user_id = v_uid) then
    return v_invite.budget_id;
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'Invite already used' using errcode = 'P0001';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Invite expired' using errcode = 'P0001';
  end if;
  insert into public.budget_members (budget_id, user_id, role) values (v_invite.budget_id, v_uid, 'editor');
  update public.budget_invites set accepted_by = v_uid, accepted_at = now() where token = p_token;
  return v_invite.budget_id;
end;
$$;

-- People in a budget, with emails so members can tell each other apart.
-- Only answers for budgets the caller belongs to.
create function public.get_budget_members(p_budget_id text)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.joined_at
  from public.budget_members m
  join auth.users u on u.id = m.user_id
  where m.budget_id = p_budget_id
    and exists (
      select 1 from public.budget_members me
      where me.budget_id = p_budget_id and me.user_id = (select auth.uid())
    )
  order by m.joined_at, m.user_id;
$$;

revoke execute on function public.create_budget(text, jsonb) from public, anon;
revoke execute on function public.get_budget_invite(uuid) from public, anon;
revoke execute on function public.accept_budget_invite(uuid) from public, anon;
revoke execute on function public.get_budget_members(text) from public, anon;
revoke execute on function public.budgets_bump_revision() from public, anon, authenticated;
revoke execute on function private.budget_members_after_delete() from public, anon, authenticated;
grant execute on function public.create_budget(text, jsonb) to authenticated;
grant execute on function public.get_budget_invite(uuid) to authenticated;
grant execute on function public.accept_budget_invite(uuid) to authenticated;
grant execute on function public.get_budget_members(text) to authenticated;

-- Live updates: members get changes to their budgets and memberships as they happen.
alter publication supabase_realtime add table public.budgets, public.budget_members;

-- Copy every existing budget into its own row, owned by the account it was in.
-- user_data.app_data is left as it is; updated clients clear its budgets once
-- they've synced.
with source as (
  select u.user_id, b.value as budget
  from public.user_data u
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(u.app_data->'budgets') = 'array' then u.app_data->'budgets' else '[]'::jsonb end
  ) as b(value)
  where jsonb_typeof(b.value) = 'object' and coalesce(b.value->>'id', '') <> ''
),
inserted as (
  insert into public.budgets (id, data, updated_by)
  select distinct on (budget->>'id') budget->>'id', budget, user_id
  from source
  order by budget->>'id', user_id
  on conflict (id) do nothing
  returning id, updated_by
)
insert into public.budget_members (budget_id, user_id, role)
select id, updated_by, 'owner' from inserted;
