-- ============================================================
-- C4 Lab — Performance Indexes
-- Run this once in Supabase SQL Editor
-- ============================================================

-- Speed up media lookups by project
create index if not exists idx_media_project_id on media(project_id);
create index if not exists idx_media_created_at on media(created_at desc);

-- Speed up comment lookups by media item
create index if not exists idx_media_comments_media_id on media_comments(media_id);
create index if not exists idx_media_comments_timestamp on media_comments(media_id, timestamp_seconds);

-- Speed up client access lookups
create index if not exists idx_client_access_profile_id on client_access(profile_id);
create index if not exists idx_client_access_client_id on client_access(client_id);

-- Speed up content request lookups
create index if not exists idx_content_requests_submitted_by on content_requests(submitted_by);
create index if not exists idx_content_requests_type on content_requests(type);
create index if not exists idx_content_requests_created_at on content_requests(created_at desc);

-- Speed up profile lookups
create index if not exists idx_profiles_role on profiles(role);

-- Speed up project lookups
create index if not exists idx_projects_client_id on projects(client_id);
create index if not exists idx_projects_created_at on projects(created_at desc);
