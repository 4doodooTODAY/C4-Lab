-- ============================================================
-- C4 Lab — Phase 2 Migration
-- Run this in Supabase SQL Editor
-- Safe to run even if some columns already exist (uses IF NOT EXISTS)
-- ============================================================

-- 1. Ensure content_requests table has all needed columns
-- (Table was created in Phase 2 setup — this adds any missing columns)

alter table content_requests
  add column if not exists type          text not null default 'post_request',
  add column if not exists idea          text,
  add column if not exists platform      text,
  add column if not exists priority      text not null default 'normal',
  add column if not exists notes         text,
  add column if not exists inspiration_url text,
  add column if not exists client_id     uuid references clients(id) on delete set null,
  add column if not exists submitted_by  uuid references profiles(id) on delete set null,
  add column if not exists status        text not null default 'new',
  add column if not exists file_url      text,
  add column if not exists file_name     text,
  add column if not exists file_size     bigint;

-- 2. Add scheduled_at to media (for client calendar view)
alter table media
  add column if not exists scheduled_at timestamptz;

-- 3. RLS for content_requests
-- Clients can insert their own requests
-- Admins/creatives can read all requests

alter table content_requests enable row level security;

-- Drop and recreate policies (safe)
drop policy if exists "clients_insert_requests" on content_requests;
drop policy if exists "clients_read_own_requests" on content_requests;
drop policy if exists "staff_read_all_requests" on content_requests;
drop policy if exists "staff_update_requests" on content_requests;

create policy "clients_insert_requests" on content_requests
  for insert with check (submitted_by = auth.uid());

create policy "clients_read_own_requests" on content_requests
  for select using (
    submitted_by = auth.uid()
    or exists (
      select 1 from profiles where id = auth.uid() and role in ('admin', 'creative')
    )
  );

create policy "staff_update_requests" on content_requests
  for update using (
    exists (
      select 1 from profiles where id = auth.uid() and role in ('admin', 'creative')
    )
  );

-- 4. Create Supabase Storage bucket for client footage (run once)
-- If you haven't created this bucket yet, go to:
-- Supabase Dashboard → Storage → New bucket
-- Name: client-footage
-- Public: true (or false + use signed URLs)
-- NOTE: You can't create buckets via SQL — do it in the dashboard
