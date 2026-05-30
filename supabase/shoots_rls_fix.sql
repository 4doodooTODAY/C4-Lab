-- ============================================================
-- SHOOTS TABLE — Definitive RLS Fix
-- The "Creatives see shoots for assigned clients" policy used
-- client_creatives (broad client membership) but the shoot
-- uses photographer_id to assign a specific creative.
-- A creative might be photographer_id on a shoot without being
-- in client_creatives for that client — so the old policy blocked them.
--
-- New rules:
--   Admin  → all shoots
--   Creative/photographer → shoots where photographer_id = their uid
--   Client → shoots for their client record
--
-- Run this entire block in Supabase SQL Editor.
-- ============================================================

alter table shoots enable row level security;

-- Drop ALL existing shoots policies to start clean
drop policy if exists "Admins full access on shoots"                on shoots;
drop policy if exists "Creatives see shoots for assigned clients"   on shoots;
drop policy if exists "Creatives manage shoots for assigned clients" on shoots;
drop policy if exists "Creatives update shoots for assigned clients" on shoots;
drop policy if exists "Team see shoots for assigned clients"        on shoots;
drop policy if exists "Team manage shoots for assigned clients"     on shoots;
drop policy if exists "Team update shoots for assigned clients"     on shoots;
drop policy if exists "Clients see own shoots"                      on shoots;
drop policy if exists "Enable read access for all users"            on shoots;
drop policy if exists "shoots_select"                               on shoots;
drop policy if exists "Admins see all shoots"                       on shoots;
drop policy if exists "Creatives see assigned shoots"               on shoots;
drop policy if exists "Clients see their shoots"                    on shoots;

-- 1. Admins: full access to everything
create policy "Admins full access on shoots"
  on shoots for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- 2. Assigned creative (photographer): see and edit their own shoots
--    Uses photographer_id directly — no client_creatives dependency
create policy "Photographer sees own shoots"
  on shoots for select
  using (photographer_id = auth.uid());

create policy "Photographer updates own shoots"
  on shoots for update
  using (photographer_id = auth.uid());

-- 3. Client: see shoots for their client record
create policy "Clients see own shoots"
  on shoots for select
  using (
    exists (
      select 1 from clients
      where clients.id         = shoots.client_id
        and clients.profile_id = auth.uid()
    )
  );
