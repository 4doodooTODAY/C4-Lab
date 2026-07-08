-- Compressed preview URLs for photo revisions (aligned index-for-index
-- with photo_urls). Review pages load these (~10x smaller); downloads and
-- pins keep using the untouched originals. Additive only.
alter table project_revisions add column if not exists preview_urls jsonb;
