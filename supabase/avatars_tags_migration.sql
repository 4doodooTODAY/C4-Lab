-- ─── Avatars + Tags Migration ────────────────────────────────────────────────
-- Run in: Supabase → SQL Editor → New query → paste all → Run

-- 1. Add avatar_url and tags columns to profiles
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists tags text[] default '{}';

-- 2. Create the avatars storage bucket (public so images load without auth)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 3. Storage policies
create policy "Avatars are publicly viewable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
