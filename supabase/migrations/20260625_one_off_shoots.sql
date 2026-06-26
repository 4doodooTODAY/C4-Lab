-- One-off shoot landing page: tables, slug generation, RLS, and secure functions.
-- Additive only — touches nothing outside one_off_shoots and shoot_leads.

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

create table one_off_shoots (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        unique not null,
  title       text        not null,
  gallery_url text        not null,
  gallery_type text       not null,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

create table shoot_leads (
  id         uuid        primary key default gen_random_uuid(),
  shoot_id   uuid        not null references one_off_shoots(id) on delete cascade,
  name       text        not null,
  email      text        not null,
  phone      text        not null default '',
  created_at timestamptz not null default now()
);

-- ── 2. Slug generation ────────────────────────────────────────────────────────
-- Generate a slug server-side on insert so every client (web, native) gets
-- a consistent URL without relying on client-supplied values.
-- Format: adjective-noun-XXXX (e.g. "silver-bloom-a3f9")

create or replace function _generate_shoot_slug()
returns trigger
language plpgsql
as $$
declare
  v_slug text;
  v_adjectives text[] := array[
    'amber','azure','bold','bright','calm','cedar','clear','coral',
    'crisp','dawn','deep','dusty','ember','fern','flint','frost',
    'gold','green','grey','ivory','jade','lapis','lush','mauve',
    'mint','mist','olive','opal','pine','plum','rose','ruby',
    'sage','salt','sand','silk','silver','slate','smoke','snow',
    'soft','steel','stone','storm','teal','umber','vivid','warm'
  ];
  v_nouns text[] := array[
    'arc','bay','bloom','blossom','brook','canyon','cliff','cloud',
    'coast','creek','crest','dawn','dew','dune','fall','field',
    'flare','flash','flow','foam','gale','glade','gleam','glow',
    'grove','haven','hill','hollow','horizon','isle','lake','leaf',
    'light','marsh','meadow','moor','moss','night','peak','petal',
    'pine','pool','rain','reed','ridge','rise','river','rock',
    'shade','shore','sky','slope','spring','stone','stream','tide',
    'trail','vale','view','wave','wild','wind','woods','yard'
  ];
begin
  -- Try up to 10 times to get a unique slug
  for i in 1..10 loop
    v_slug := v_adjectives[1 + floor(random() * array_length(v_adjectives, 1))::int]
           || '-'
           || v_nouns[1 + floor(random() * array_length(v_nouns, 1))::int]
           || '-'
           || substr(md5(random()::text), 1, 4);
    begin
      new.slug := v_slug;
      return new;
    exception when unique_violation then
      continue;
    end;
  end loop;
  -- Fallback: uuid-based slug (guaranteed unique)
  new.slug := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  return new;
end;
$$;

create trigger trg_one_off_shoots_slug
  before insert on one_off_shoots
  for each row
  when (new.slug is null or new.slug = '')
  execute function _generate_shoot_slug();

-- ── 3. RLS ────────────────────────────────────────────────────────────────────

alter table one_off_shoots enable row level security;
alter table shoot_leads    enable row level security;

-- Anon: no direct access to either table
-- (no policies for anon = implicit deny; functions below are the only door in)

-- Authenticated users can read and manage both tables
create policy "authenticated_select_one_off_shoots"
  on one_off_shoots for select
  to authenticated
  using (true);

create policy "authenticated_insert_one_off_shoots"
  on one_off_shoots for insert
  to authenticated
  with check (true);

create policy "authenticated_update_one_off_shoots"
  on one_off_shoots for update
  to authenticated
  using (true);

create policy "authenticated_select_shoot_leads"
  on shoot_leads for select
  to authenticated
  using (true);

create policy "authenticated_insert_shoot_leads"
  on shoot_leads for insert
  to authenticated
  with check (true);

create policy "authenticated_update_shoot_leads"
  on shoot_leads for update
  to authenticated
  using (true);

-- ── 4. SECURITY DEFINER functions ─────────────────────────────────────────────

-- Returns only title + gallery_type for an active shoot. No gallery_url ever.
create or replace function get_shoot_public(p_slug text)
returns table (title text, gallery_type text)
language sql
security definer
set search_path = public
as $$
  select s.title, s.gallery_type
  from   one_off_shoots s
  where  s.slug   = p_slug
    and  s.active = true
  limit 1;
$$;

-- Inserts a lead then returns the gallery_url — the only path to that value.
create or replace function claim_shoot(
  p_slug  text,
  p_name  text,
  p_email text,
  p_phone text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shoot_id   uuid;
  v_gallery_url text;
begin
  select id, gallery_url
  into   v_shoot_id, v_gallery_url
  from   one_off_shoots
  where  slug   = p_slug
    and  active = true
  limit 1;

  if v_shoot_id is null then
    raise exception 'shoot not found or inactive';
  end if;

  insert into shoot_leads (shoot_id, name, email, phone)
  values (v_shoot_id, p_name, p_email, coalesce(p_phone, ''));

  return v_gallery_url;
end;
$$;

-- Grant execute on both functions to anon
grant execute on function get_shoot_public(text)                    to anon;
grant execute on function claim_shoot(text, text, text, text)       to anon;
