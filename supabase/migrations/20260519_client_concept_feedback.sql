-- Add client feedback fields to content_drafts
alter table content_drafts
  add column if not exists client_footage_links text[] default null,
  add column if not exists client_notes         text    default null;
