-- Safe multi-device sync, plus tidy-ups to user_data.
--
-- Each user's budgets live in one JSON document. Until now every save was a
-- blind upsert, so a device holding stale data could overwrite a newer copy
-- written by another device. `revision` lets clients write conditionally
-- (`update ... where revision = <the revision they last read>`); when that
-- matches no row, the client fetches the newer copy, merges and retries.
--
-- Compatible with clients that still do a plain upsert on user_id: their
-- writes bump the revision too, so newer clients see them as a conflict.

-- Revision and updated_at are set by the database, never trusted from clients.
alter table public.user_data add column revision bigint not null default 1;

update public.user_data set updated_at = now() where updated_at is null;
alter table public.user_data alter column updated_at set not null;

create function public.user_data_bump_revision()
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
  return new;
end;
$$;

create trigger user_data_bump_revision
  before insert or update on public.user_data
  for each row execute function public.user_data_bump_revision();

-- One row per user, so user_id is the natural key; the surrogate id was never read.
alter table public.user_data drop constraint user_data_pkey;
alter table public.user_data drop column id;
alter table public.user_data drop constraint user_data_user_id_key;
alter table public.user_data add constraint user_data_pkey primary key (user_id);

-- Deleting the auth user removes their data, whichever path deletes them
-- (the delete-account function or the dashboard).
alter table public.user_data drop constraint user_data_user_id_fkey;
alter table public.user_data add constraint user_data_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- Only signed-in users have a row to reach; signed-out requests get nothing.
alter policy "Users can only see their own data" on public.user_data to authenticated;
alter policy "Users can only update their own data" on public.user_data to authenticated;
alter policy "Users can only insert their own data" on public.user_data to authenticated;
revoke all on public.user_data from anon;
