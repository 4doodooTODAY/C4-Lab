-- Gallery dedup + recoverable trash.
-- Duplicate = same shoot_id AND identical SHA-256 of raw file bytes. Nothing
-- with a different hash is ever touched. "Removal" is deleted_at (soft), the
-- canonical copy's storage objects are shared — no bytes are ever hard-deleted
-- by dedup.

alter table one_off_shoot_images
  add column if not exists content_hash   text,
  add column if not exists deleted_at     timestamptz,
  add column if not exists deleted_reason text;

create index if not exists idx_oosi_hash
  on one_off_shoot_images(shoot_id, content_hash);

-- ⚠️ FLAGGED: modifies get_shoot_gallery (a SECURITY DEFINER function added
-- in 20260702). Change: excludes soft-deleted images from the public gallery.
-- Security posture unchanged — same columns, same anon grant.
create or replace function get_shoot_gallery(p_slug text)
returns table (shoot_title text, image_id uuid, thumb_path text,
               preview_path text, file_name text, width int, height int,
               sort_order int)
language sql security definer set search_path = public as $$
  select s.title, i.id, i.thumb_path, i.preview_path, i.file_name,
         i.width, i.height, i.sort_order
  from one_off_shoots s
  join one_off_shoot_images i on i.shoot_id = s.id
  where s.slug = p_slug and s.active = true and i.deleted_at is null
  order by i.sort_order, i.created_at;
$$;

-- Same exclusion for the count used by the meta call.
create or replace function get_shoot_gallery_meta(p_slug text)
returns table (shoot_title text, image_count bigint)
language sql security definer set search_path = public as $$
  select s.title, count(i.id) filter (where i.deleted_at is null)
  from one_off_shoots s
  left join one_off_shoot_images i on i.shoot_id = s.id
  where s.slug = p_slug and s.active = true
  group by s.title;
$$;
