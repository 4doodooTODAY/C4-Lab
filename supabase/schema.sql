-- ============================================================
-- C4 Lab — Supabase Schema
-- Run this in your Supabase project: SQL Editor → New query
-- ============================================================

-- Videos
create table if not exists videos (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null,
  description text,
  drive_url   text not null,
  user_id     text default 'mvp-user'
);

-- Timestamped comments on videos
create table if not exists video_comments (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  video_id          uuid not null references videos(id) on delete cascade,
  content           text not null,
  timestamp_seconds numeric not null,
  author_name       text,
  user_id           text default 'mvp-user'
);

-- Calendar events
create table if not exists calendar_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null,
  description text,
  event_date  date not null,
  event_type  text not null default 'general',
  color       text not null default '#6C63FF',
  user_id     text default 'mvp-user'
);

-- ============================================================
-- Row Level Security (permissive for MVP — tighten when you add auth)
-- ============================================================
alter table videos          enable row level security;
alter table video_comments  enable row level security;
alter table calendar_events enable row level security;

-- Allow all operations for now (replace with auth-scoped policies when ready)
create policy "public_all_videos"   on videos          for all using (true) with check (true);
create policy "public_all_comments" on video_comments  for all using (true) with check (true);
create policy "public_all_events"   on calendar_events for all using (true) with check (true);

-- ============================================================
-- Enable Realtime for live comment updates
-- ============================================================
alter publication supabase_realtime add table video_comments;

-- ============================================================
-- Migration: rename drive_url → video_url (run if you already
-- created the table with the original schema)
-- ============================================================
-- alter table videos rename column drive_url to video_url;
