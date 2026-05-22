-- ── project_shoots: client calendar sync migration ───────────────────────────
-- Adds title, status, and calendar_event_id to project_shoots so shoots can
-- be tracked end-to-end and cleaned up when deleted.
-- Also establishes RLS so clients only see shoots for their own projects.

-- Add columns (idempotent)
alter table project_shoots
  add column if not exists title             text,
  add column if not exists status            text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  add column if not exists calendar_event_id uuid
    references calendar_events(id) on delete set null;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table project_shoots enable row level security;

-- Clients: read-only, scoped to their own projects
create policy "project_shoots_client_select"
  on project_shoots for select
  to authenticated
  using (
    -- admins and creatives always have full access via the team policy
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'creative'))
    -- editors on the project
    or exists (
      select 1 from projects p
      where p.id = project_shoots.project_id
        and p.editor_id = auth.uid()
    )
    -- client whose project this is
    or exists (
      select 1 from projects p
      join clients c on c.id = p.client_id
      where p.id = project_shoots.project_id
        and c.profile_id = auth.uid()
    )
  );

-- Team (admin / creative): full CRUD
create policy "project_shoots_team_insert"
  on project_shoots for insert
  to authenticated
  with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'creative'))
  );

create policy "project_shoots_team_update"
  on project_shoots for update
  to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'creative'))
  );

create policy "project_shoots_team_delete"
  on project_shoots for delete
  to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'creative'))
  );

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Allows ContentCalendar to subscribe and receive live INSERT/UPDATE/DELETE events.
-- Run this only once; re-running is safe because ADD TABLE is idempotent in PG 15+.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename = 'project_shoots'
  ) then
    execute 'alter publication supabase_realtime add table project_shoots';
  end if;
end$$;
