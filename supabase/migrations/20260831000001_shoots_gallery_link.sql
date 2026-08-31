-- Link a project shoot to a one_off_shoot gallery.
-- Additive only. Lets admins generate a shareable gallery link from inside
-- the shoot detail modal instead of going to Gallery Links separately.

alter table one_off_shoots
  add column if not exists source_shoot_id uuid
    references shoots(id) on delete set null;

create index if not exists idx_ooss_source_shoot
  on one_off_shoots(source_shoot_id)
  where source_shoot_id is not null;
