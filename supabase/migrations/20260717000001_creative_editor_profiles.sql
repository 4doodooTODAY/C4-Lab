-- Creative and Editor Profile Enhancements
-- Add specialized profile fields for creatives and editors

-- Creative fields: about, equipment, ideal shoot types
alter table profiles
  add column if not exists creative_about text,
  add column if not exists creative_equipment text,
  add column if not exists creative_ideal_shoots text[];

-- Editor fields: about, software, ideal edit types, AI tools
alter table profiles
  add column if not exists editor_about text,
  add column if not exists editor_software text,
  add column if not exists editor_ideal_edits text[],
  add column if not exists editor_ai_tools text[];

-- Referral pool enhancements
alter table shoot_referrals
  add column if not exists shoot_type text,  -- "Restaurant Photography", "Wedding Photos & Video", etc.
  add column if not exists rate_amount numeric,  -- base rate before cuts
  add column if not exists referral_status text default 'pending',  -- pending | approved | declined
  add column if not exists status_updated_by uuid references profiles(id) on delete set null,
  add column if not exists status_notes text,
  add column if not exists status_updated_at timestamptz;

-- Create index for faster lookups on referral status
create index if not exists idx_shoot_referrals_status on shoot_referrals(referral_status);
create index if not exists idx_shoot_referrals_posted_by on shoot_referrals(posted_by);
