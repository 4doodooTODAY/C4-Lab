-- Turn on row level security.
--
-- READ THIS BEFORE APPLYING. Run supabase/rls_audit.sql first and keep the
-- output. RLS that is enabled on a table with no policies is deny-all, which
-- takes the app down for every user at once. This migration is written so that
-- cannot happen: it only enables RLS where policies already exist to activate,
-- plus the specific tables handled explicitly below.
--
-- What the repo showed before this migration:
--   * `profiles` had no policies and no RLS anywhere in version control. It is
--     the table holding names, phone numbers, and roles, and every signed-in
--     user could read and write all of it.
--   * `clients` and `photo_revision_comments` had policies written but no
--     `enable row level security`. Policies with RLS off do nothing at all.
--     The dashboard shows a tidy policy list and the table is wide open.
--
-- Some of this may already have been switched on by hand in the dashboard.
-- Every statement here is idempotent, so applying it either way is safe.

-- ── Helper: read the caller's role without recursing ─────────────────────────
-- A policy on `profiles` that selects from `profiles` recurses forever. This is
-- security definer, so it bypasses RLS and breaks the loop. It is the standard
-- fix for this footgun and it must stay security definer.
create or replace function public.app_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

revoke all on function public.app_current_role() from public;
grant execute on function public.app_current_role() to authenticated, service_role;

-- ── profiles ─────────────────────────────────────────────────────────────────
-- Read: you always see yourself. Team members (admin, creative, editor) see
-- everyone, because the app shows teammate names and avatars on comments,
-- pickers, and project members. Clients see themselves plus the team, and not
-- other clients, so one client cannot enumerate another client's contact name
-- and phone number.
drop policy if exists "profiles select" on profiles;
create policy "profiles select" on profiles
  for select using (
    profiles.id = auth.uid()
    or public.app_current_role() in ('admin', 'creative', 'editor')
    or profiles.role in ('admin', 'creative', 'editor')
  );

-- Write: your own row, or any row if you are an admin. Which COLUMNS you may
-- write is handled by the grants below, not here.
drop policy if exists "profiles update" on profiles;
create policy "profiles update" on profiles
  for update
  using      (profiles.id = auth.uid() or public.app_current_role() = 'admin')
  with check (profiles.id = auth.uid() or public.app_current_role() = 'admin');

-- No insert or delete policy on purpose. Accounts are created and removed by
-- the create-user edge function on the service role, which bypasses RLS.

-- Privilege escalation guard. Without this, "update your own row" means a user
-- can set their own role to 'admin'. Column level grants stop that one level
-- below RLS: `role` and `id` are simply not writable by a logged-in client, so
-- no policy mistake can reopen it. Role changes go through create-user.
-- Built from the live column list so a future column does not break this.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name not in ('id', 'role');

  execute 'revoke update on public.profiles from authenticated';
  if cols is not null then
    execute format('grant update (%s) on public.profiles to authenticated', cols);
  end if;
end $$;

alter table profiles enable row level security;

-- ── waitlist ─────────────────────────────────────────────────────────────────
-- Applications are written by the join-waitlist edge function on the service
-- role and are read by nothing in the app today. Deny-all is the correct and
-- intended state here, not an oversight. If an admin review screen is ever
-- built, it needs an admin select policy added at that point.
alter table waitlist enable row level security;

-- ── Everything that already had policies written ─────────────────────────────
-- These are the inert ones: a policy list that does nothing because RLS was
-- never switched on. Enabling RLS activates protection that was already
-- written and reviewed, so this is the safe class to do in bulk.
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_policy  p on p.polrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = false
    group by c.relname
    order by c.relname
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    raise notice 'RLS enabled on % (policies already existed)', r.relname;
  end loop;
end $$;

-- ── What is deliberately NOT touched ─────────────────────────────────────────
-- Tables with no RLS and no policies are left alone. Enabling RLS on them
-- would deny all access and break whatever reads them, and writing policies
-- blind would be guesswork. This block names them in the migration output so
-- the list is a decision to make, not something to discover in an incident.
do $$
declare
  r record;
  found_any boolean := false;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = false
    group by c.relname
    having count(p.polname) = 0
    order by c.relname
  loop
    found_any := true;
    raise warning 'STILL UNPROTECTED: public.% has no RLS and no policies', r.relname;
  end loop;

  if not found_any then
    raise notice 'No unprotected tables remain.';
  end if;
end $$;
