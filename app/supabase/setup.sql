-- Run in Supabase → SQL Editor. Safe to re-run (idempotent).
create table if not exists projects (id text primary key, device text, at bigint, data jsonb);
create index if not exists projects_device on projects(device);
alter table projects enable row level security; -- only the server (service role) reads/writes
insert into storage.buckets (id, name, public) values ('clips','clips', true) on conflict do nothing;

-- Step 2: Google login — projects belong to a user
alter table projects add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table projects alter column device drop not null;
create index if not exists projects_user on projects(user_id, at desc);
