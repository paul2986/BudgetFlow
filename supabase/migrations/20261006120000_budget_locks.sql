-- Budget lock: a 4-digit code that hides a budget until it is entered.
--
-- One row per person per budget they've locked. It belongs to the account, not
-- the budget: the people a budget is shared with see none of it and are never
-- asked for the code, and signing in on another device (a phone, the web app, a
-- home-screen install) finds the budget locked there too. Which devices are
-- unlocked right now is not stored; each device keeps that to itself.
--
-- pin_verifier is a salted, slow hash of the code ("v1$<iterations>$<salt>$<hash>"),
-- never the code. The app checks a code against it on the device, so a locked
-- budget still opens offline. Four digits can't withstand someone who has the
-- row, and the budget itself is not encrypted, so this is a screen lock for
-- whoever picks up the device, not protection for the data.
--
-- The table is written through set_budget_lock() and the auto-lock column;
-- turning the lock off is a plain delete.

create table public.budget_locks (
  user_id uuid not null references auth.users (id) on delete cascade,
  budget_id text not null references public.budgets (id) on delete cascade,
  pin_verifier text not null check (char_length(pin_verifier) between 20 and 200),
  -- When to ask again: 0 as soon as the app is left, n minutes after leaving, -1 never.
  auto_lock_minutes integer not null default 0 check (auto_lock_minutes between -1 and 1440),
  updated_at timestamptz not null default now(),
  primary key (user_id, budget_id)
);
create index budget_locks_budget_id_idx on public.budget_locks (budget_id);

create function public.budget_locks_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger budget_locks_touch
  before update on public.budget_locks
  for each row execute function public.budget_locks_touch();

alter table public.budget_locks enable row level security;

create policy "People see their own locks" on public.budget_locks
  for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_budget_member(budget_id)));
create policy "People change their own locks" on public.budget_locks
  for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_budget_member(budget_id)))
  with check (user_id = (select auth.uid()) and (select private.is_budget_member(budget_id)));
create policy "People remove their own locks" on public.budget_locks
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.budget_locks from anon, authenticated;
grant select, delete on public.budget_locks to authenticated;
grant update (auto_lock_minutes) on public.budget_locks to authenticated;

-- Lock a budget, or change its code or auto-lock time. Creating the row goes
-- through here so it can only ever be for the caller and a budget they belong to.
create function public.set_budget_lock(p_budget_id text, p_pin_verifier text, p_auto_lock_minutes integer)
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
  if not (select private.is_budget_member(p_budget_id)) then
    raise exception 'Budget not found' using errcode = 'P0002';
  end if;
  insert into public.budget_locks (user_id, budget_id, pin_verifier, auto_lock_minutes)
  values (v_uid, p_budget_id, p_pin_verifier, p_auto_lock_minutes)
  on conflict (user_id, budget_id) do update
    set pin_verifier = excluded.pin_verifier,
        auto_lock_minutes = excluded.auto_lock_minutes;
end;
$$;

revoke execute on function public.set_budget_lock(text, text, integer) from public, anon;
revoke execute on function public.budget_locks_touch() from public, anon, authenticated;
grant execute on function public.set_budget_lock(text, text, integer) to authenticated;

-- Someone who leaves a budget, or is removed from it, takes their lock with them
-- (the budget's own deletion already clears every lock on it). Otherwise it would
-- be waiting for them, with its old code, if they were ever invited back.
create or replace function private.budget_members_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.budget_locks where budget_id = old.budget_id and user_id = old.user_id;
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

-- Live updates: a lock turned on or off elsewhere reaches the other devices at once.
alter publication supabase_realtime add table public.budget_locks;
