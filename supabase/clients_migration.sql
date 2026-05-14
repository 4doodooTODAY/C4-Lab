-- ─── Client Management Migration ─────────────────────────────────────────────
-- Run in: Supabase → SQL Editor → New query → paste all → Run

-- 1. Expand the clients table with contact + meta columns
alter table clients
  add column if not exists contact_name text,
  add column if not exists email        text,
  add column if not exists phone        text,
  add column if not exists notes        text,
  add column if not exists profile_id   uuid references profiles(id) on delete set null;

-- 2. Add phone to profiles (for client users to have phone visible on their profile)
alter table profiles
  add column if not exists phone text;

-- 3. Index for fast profile_id lookups
create index if not exists clients_profile_id_idx on clients(profile_id);

-- 4. Ensure admins can insert/update/delete clients (if not already)
-- Check existing policies first — only add if missing
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'Admins can manage clients'
  ) then
    execute $policy$
      create policy "Admins can manage clients"
        on clients for all
        using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
        with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
    $policy$;
  end if;
end $$;

-- 5. Let clients read their own client record (so client dashboard can show their info)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'Clients can read their own record'
  ) then
    execute $policy$
      create policy "Clients can read their own record"
        on clients for select
        using (profile_id = auth.uid())
    $policy$;
  end if;
end $$;
