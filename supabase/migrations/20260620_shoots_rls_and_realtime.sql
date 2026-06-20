-- Definitive shoots RLS + realtime fix
-- Drops every known variant of the client SELECT policy on shoots,
-- then creates exactly one clean policy using clients.profile_id.
-- Also ensures shoots is in the supabase_realtime publication so the
-- client calendar subscription receives live INSERT/UPDATE events.

-- ── 1. Drop every known client-facing SELECT policy on shoots ────────────────
drop policy if exists "clients can view own shoots"                on shoots;
drop policy if exists "Clients see own shoots"                     on shoots;
drop policy if exists "Clients see their shoots"                   on shoots;
drop policy if exists "clients see their shoots"                   on shoots;
drop policy if exists "client_shoots_select"                       on shoots;
drop policy if exists "clients can see their shoots"               on shoots;

-- ── 2. Create one definitive client SELECT policy ────────────────────────────
create policy "clients can view own shoots"
  on shoots for select
  to authenticated
  using (
    exists (
      select 1 from clients c
      where c.id         = shoots.client_id
        and c.profile_id = auth.uid()
    )
  );

-- ── 3. Ensure shoots table is in the realtime publication ────────────────────
-- Allows the ContentCalendar subscription to receive live shoot events.
do $$
begin
  if not exists (
    select 1
    from   pg_publication_tables
    where  pubname   = 'supabase_realtime'
      and  tablename = 'shoots'
  ) then
    execute 'alter publication supabase_realtime add table shoots';
  end if;
end$$;
