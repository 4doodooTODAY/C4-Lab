-- RLS audit. READ ONLY. Run this in the Supabase SQL editor BEFORE applying
-- the enable_rls migration, and again after, to confirm what changed.
--
-- The repo does not capture RLS that was switched on by hand in the dashboard,
-- so the repo is not a reliable picture of the live database. This is.

-- 1. THE DANGEROUS ONES: policies exist but RLS is OFF.
--    Policies with RLS disabled are inert. The table looks protected in the
--    dashboard's policy list and is in fact wide open. Fix these first.
select
  c.relname                             as table_name,
  count(p.polname)                      as policy_count,
  'POLICIES INERT, RLS IS OFF'          as finding
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
group by c.relname
having count(p.polname) > 0
order by c.relname;

-- 2. THE OTHER HOLE: RLS off and no policies at all. Any client holding the
--    anon key can read the whole table. Each one needs a decision: write
--    policies, or confirm only the service role ever touches it.
select
  c.relname as table_name,
  'NO RLS, NO POLICIES' as finding
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
group by c.relname
having count(p.polname) = 0
order by c.relname;

-- 3. LOCKED OUT: RLS on but no policies. Deny-all for anon and authenticated.
--    Correct for service-role-only tables (waitlist, rate_limits). A bug for
--    anything the app reads directly.
select
  c.relname as table_name,
  'RLS ON, NO POLICIES (deny all)' as finding
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
group by c.relname
having count(p.polname) = 0
order by c.relname;

-- 4. Full picture, every table, for the record.
select
  c.relname            as table_name,
  c.relrowsecurity     as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  count(p.polname)     as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity, c.relforcerowsecurity
order by c.relrowsecurity, count(p.polname), c.relname;

-- 5. What anon and authenticated can reach through plain grants, before RLS
--    even enters the picture. A table with RLS on is still invisible without a
--    grant; a table with RLS off is fully readable with one.
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;
