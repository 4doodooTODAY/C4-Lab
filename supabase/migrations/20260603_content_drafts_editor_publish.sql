-- Add assigned_editor_id and published_at to content_drafts
ALTER TABLE content_drafts
  ADD COLUMN IF NOT EXISTS assigned_editor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at timestamptz DEFAULT NULL;

-- Index for editor lookups
CREATE INDEX IF NOT EXISTS content_drafts_assigned_editor_idx ON content_drafts(assigned_editor_id);
