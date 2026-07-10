-- Gallery items can now be videos as well as photos. is_video flags a video;
-- its thumb/preview are a poster frame (public), the original video stays in
-- the private bucket and streams via a signed URL after the name+phone claim.
alter table one_off_shoot_images add column if not exists is_video boolean not null default false;

-- Return is_video so the gallery can render a player + play badge.
drop function if exists get_shoot_gallery(text);
create or replace function get_shoot_gallery(p_slug text)
returns table (shoot_title text, image_id uuid, thumb_path text,
               preview_path text, file_name text, width int, height int,
               sort_order int, is_video boolean)
language sql security definer set search_path = public as $$
  select s.title, i.id, i.thumb_path, i.preview_path, i.file_name,
         i.width, i.height, i.sort_order, i.is_video
  from one_off_shoots s
  join one_off_shoot_images i on i.shoot_id = s.id
  where s.slug = p_slug and s.active = true and i.deleted_at is null
  order by i.sort_order, i.created_at;
$$;
grant execute on function get_shoot_gallery(text) to anon;
