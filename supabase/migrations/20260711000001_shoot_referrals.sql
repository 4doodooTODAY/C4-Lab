-- Referral pool: creatives/admins post shoot gigs (date, time, location, pay);
-- other team members claim them first-come-first-served. Never visible to
-- clients — RLS restricts every operation to admin/creative/editor roles.

create table shoot_referrals (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  shoot_date  date,
  shoot_time  time,
  location    text,
  pay         text,                -- freeform: "$250", "$150/hr", etc.
  notes       text,
  posted_by   uuid not null references profiles(id) on delete cascade,
  claimed_by  uuid references profiles(id) on delete set null,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);

create or replace function _is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles
                 where id = auth.uid() and role in ('admin','creative','editor'));
$$;

alter table shoot_referrals enable row level security;

-- Team members (never clients) can see the pool
create policy "team_select_referrals" on shoot_referrals
  for select to authenticated using (_is_team());

-- Team members post as themselves
create policy "team_insert_referrals" on shoot_referrals
  for insert to authenticated
  with check (_is_team() and posted_by = auth.uid());

-- Claim/unclaim: unclaimed rows are claimable; you can release your own claim;
-- the poster or an admin can edit their listing. First-come-first-served is
-- enforced app-side with `update … where claimed_by is null` (0 rows = lost race).
create policy "team_update_referrals" on shoot_referrals
  for update to authenticated
  using (_is_team() and (claimed_by is null or claimed_by = auth.uid()
         or posted_by = auth.uid() or _is_admin()))
  with check (_is_team());

-- Poster removes their own unclaimed listing; admins anything
create policy "team_delete_referrals" on shoot_referrals
  for delete to authenticated
  using ((_is_admin()) or (posted_by = auth.uid() and claimed_by is null));
