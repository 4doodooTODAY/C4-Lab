-- Per-user project pinning. Additive; touches nothing else.
create table project_pins (
  profile_id uuid not null references profiles(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, project_id)
);

alter table project_pins enable row level security;

-- Users manage only their own pins. No anon access.
create policy "own_pins_select" on project_pins
  for select to authenticated using (profile_id = auth.uid());
create policy "own_pins_insert" on project_pins
  for insert to authenticated with check (profile_id = auth.uid());
create policy "own_pins_delete" on project_pins
  for delete to authenticated using (profile_id = auth.uid());
