-- Rename description to creative_notes on shoots table
alter table shoots rename column description to creative_notes;

-- Update RLS policies to ensure creative_notes is visible only to creatives/admins, not clients
-- This is already handled by the application layer, but can be enforced via RLS if needed
