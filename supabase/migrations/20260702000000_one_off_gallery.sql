-- One-off shoot gallery: images, download claims, favorites, pin comments.
-- Additive. Does NOT modify existing claim_shoot()/get_shoot_public().
-- Run with: supabase db push (or paste into the dashboard SQL editor).

-- ⚠️ gallery_url becomes nullable (link field removed from the product;
-- existing rows keep their value, nothing breaks).
alter table one_off_shoots alter column gallery_url drop not null;
-- ⚠️ phone-only leads — email/name no longer required
alter table shoot_leads alter column email set default '';
alter table shoot_leads alter column name  set default '';

-- ── Images ───────────────────────────────────────────────────────────────
create table one_off_shoot_images (
  id            uuid primary key default gen_random_uuid(),
  shoot_id      uuid not null references one_off_shoots(id) on delete cascade,
  file_name     text not null,
  file_size     bigint,
  width         int,
  height        int,
  original_path text not null,   -- private bucket key; never exposed to anon
  preview_path  text not null,   -- public bucket key (~1600px webp)
  thumb_path    text not null,   -- public bucket key (~400px webp)
  sort_order    int  not null default 0,
  uploaded_by   uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index idx_oosi_shoot on one_off_shoot_images(shoot_id);

-- ── Download claims (phone gate sessions) ────────────────────────────────
create table shoot_download_claims (
  id         uuid primary key default gen_random_uuid(),  -- the bearer token
  shoot_id   uuid not null references one_off_shoots(id) on delete cascade,
  lead_id    uuid not null references shoot_leads(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now()
);
create index idx_sdc_shoot on shoot_download_claims(shoot_id);

-- ── Favorites + pin comments (proofing) ──────────────────────────────────
create table one_off_shoot_favorites (
  id         uuid primary key default gen_random_uuid(),
  image_id   uuid not null references one_off_shoot_images(id) on delete cascade,
  claim_id   uuid not null references shoot_download_claims(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (image_id, claim_id)
);
create table one_off_shoot_image_comments (
  id         uuid primary key default gen_random_uuid(),
  image_id   uuid not null references one_off_shoot_images(id) on delete cascade,
  claim_id   uuid references shoot_download_claims(id) on delete set null,
  x_pct      numeric(5,2) not null,   -- mirrors photo_revision_comments
  y_pct      numeric(5,2) not null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index idx_oosc_image on one_off_shoot_image_comments(image_id);

-- ── RLS: deny anon, allow authenticated (same pattern as phase 1) ────────
alter table one_off_shoot_images         enable row level security;
alter table shoot_download_claims        enable row level security;
alter table one_off_shoot_favorites      enable row level security;
alter table one_off_shoot_image_comments enable row level security;

create policy "auth_all_oosi" on one_off_shoot_images
  for all to authenticated using (true) with check (true);
create policy "auth_select_sdc" on shoot_download_claims
  for select to authenticated using (true);
create policy "auth_select_oosf" on one_off_shoot_favorites
  for select to authenticated using (true);
create policy "auth_select_oosc" on one_off_shoot_image_comments
  for select to authenticated using (true);

-- ── SECURITY DEFINER functions (anon's only doors, same pattern) ─────────

-- Gallery payload: title + derivative paths only. Original paths never returned.
create or replace function get_shoot_gallery(p_slug text)
returns table (shoot_title text, image_id uuid, thumb_path text,
               preview_path text, file_name text, width int, height int,
               sort_order int)
language sql security definer set search_path = public as $$
  select s.title, i.id, i.thumb_path, i.preview_path, i.file_name,
         i.width, i.height, i.sort_order
  from one_off_shoots s
  join one_off_shoot_images i on i.shoot_id = s.id
  where s.slug = p_slug and s.active = true
  order by i.sort_order, i.created_at;
$$;

-- Shoot title even when it has no images yet (so the page can render).
create or replace function get_shoot_gallery_meta(p_slug text)
returns table (shoot_title text, image_count bigint)
language sql security definer set search_path = public as $$
  select s.title, count(i.id)
  from one_off_shoots s
  left join one_off_shoot_images i on i.shoot_id = s.id
  where s.slug = p_slug and s.active = true
  group by s.title;
$$;

-- Phone gate: capture lead, mint a 24h claim token.
create or replace function claim_shoot_downloads(p_slug text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_shoot_id uuid; v_lead_id uuid; v_claim_id uuid;
begin
  if coalesce(trim(p_phone), '') = '' or length(trim(p_phone)) < 7 then
    raise exception 'valid phone required';
  end if;
  select id into v_shoot_id from one_off_shoots
    where slug = p_slug and active = true limit 1;
  if v_shoot_id is null then raise exception 'shoot not found or inactive'; end if;

  insert into shoot_leads (shoot_id, name, email, phone)
  values (v_shoot_id, '', '', trim(p_phone))
  returning id into v_lead_id;

  insert into shoot_download_claims (shoot_id, lead_id)
  values (v_shoot_id, v_lead_id)
  returning id into v_claim_id;
  return v_claim_id;
end; $$;

-- Favorites toggle — requires a live claim on the image's shoot.
create or replace function toggle_shoot_favorite(p_claim uuid, p_image uuid)
returns boolean  -- true = now favorited, false = unfavorited
language plpgsql security definer set search_path = public as $$
declare v_ok boolean; v_existing uuid;
begin
  select true into v_ok
  from shoot_download_claims c
  join one_off_shoot_images i on i.shoot_id = c.shoot_id
  where c.id = p_claim and i.id = p_image and c.expires_at > now();
  if v_ok is null then raise exception 'invalid or expired claim'; end if;

  select id into v_existing from one_off_shoot_favorites
    where image_id = p_image and claim_id = p_claim;
  if v_existing is null then
    insert into one_off_shoot_favorites (image_id, claim_id) values (p_image, p_claim);
    return true;
  else
    delete from one_off_shoot_favorites where id = v_existing;
    return false;
  end if;
end; $$;

-- Pin-drop comment — same claim requirement, mirrors x_pct/y_pct model.
create or replace function add_shoot_image_comment(
  p_claim uuid, p_image uuid, p_x numeric, p_y numeric, p_body text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ok boolean; v_id uuid;
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'comment required'; end if;
  select true into v_ok
  from shoot_download_claims c
  join one_off_shoot_images i on i.shoot_id = c.shoot_id
  where c.id = p_claim and i.id = p_image and c.expires_at > now();
  if v_ok is null then raise exception 'invalid or expired claim'; end if;

  insert into one_off_shoot_image_comments (image_id, claim_id, x_pct, y_pct, body)
  values (p_image, p_claim,
          round(least(greatest(p_x,0),100), 2),
          round(least(greatest(p_y,0),100), 2),
          trim(p_body))
  returning id into v_id;
  return v_id;
end; $$;

-- Read the visitor's own favorites/comments back (so pins persist on reload).
create or replace function get_shoot_proofing(p_claim uuid)
returns table (image_id uuid, kind text, x_pct numeric, y_pct numeric, body text)
language sql security definer set search_path = public as $$
  select f.image_id, 'favorite'::text, null::numeric, null::numeric, null::text
  from one_off_shoot_favorites f
  join shoot_download_claims c on c.id = f.claim_id
  where f.claim_id = p_claim and c.expires_at > now()
  union all
  select m.image_id, 'comment', m.x_pct, m.y_pct, m.body
  from one_off_shoot_image_comments m
  join shoot_download_claims c on c.id = m.claim_id
  where m.claim_id = p_claim and c.expires_at > now();
$$;

grant execute on function get_shoot_gallery(text)                                     to anon;
grant execute on function get_shoot_gallery_meta(text)                                to anon;
grant execute on function claim_shoot_downloads(text, text)                           to anon;
grant execute on function toggle_shoot_favorite(uuid, uuid)                           to anon;
grant execute on function add_shoot_image_comment(uuid, uuid, numeric, numeric, text) to anon;
grant execute on function get_shoot_proofing(uuid)                                    to anon;

-- ── Storage buckets + policies ────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('shoot-originals', 'shoot-originals', false, null),
       ('shoot-previews',  'shoot-previews',  true,  10485760)
on conflict (id) do nothing;

create policy "auth_insert_shoot_originals" on storage.objects for insert
  to authenticated with check (bucket_id = 'shoot-originals');
create policy "auth_select_shoot_originals" on storage.objects for select
  to authenticated using (bucket_id = 'shoot-originals');
create policy "auth_delete_shoot_originals" on storage.objects for delete
  to authenticated using (bucket_id = 'shoot-originals');

create policy "auth_insert_shoot_previews" on storage.objects for insert
  to authenticated with check (bucket_id = 'shoot-previews');
create policy "auth_delete_shoot_previews" on storage.objects for delete
  to authenticated using (bucket_id = 'shoot-previews');
