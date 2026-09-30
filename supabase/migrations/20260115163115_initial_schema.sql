create table if not exists user_data (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null unique,
  app_data jsonb not null,
  updated_at timestamptz default now()
);

alter table user_data enable row level security;

create policy "Users can only see their own data"
  on user_data for select
  using (auth.uid() = user_id);

create policy "Users can only update their own data"
  on user_data for update
  using (auth.uid() = user_id);

create policy "Users can only insert their own data"
  on user_data for insert
  with check (auth.uid() = user_id);
