-- Shoot notes are keyed by shoot_id, but the table still carried a legacy
-- NOT NULL project_id column. The shoot-notes composer only sends
-- (shoot_id, profile_id, content), so every insert failed the not-null
-- constraint and the note silently couldn't be posted. Make project_id
-- optional so shoot-scoped notes can be created.
alter table shoot_notes alter column project_id drop not null;
