-- Digest notifications: preferences, idempotent digest log, hourly pg_cron
-- trigger for the send-digests edge function. Reuses the EXISTING
-- push_subscriptions table (profile_id / auth_key) — only adds a platform
-- column for future native (FCM/APNs) subscriptions. Additive only.

-- ── Preferences: per-user cadence + channel ───────────────────────────────
create table notification_preferences (
  user_id    uuid primary key references profiles(id) on delete cascade,
  cadence    text not null default 'weekly'
             check (cadence in ('daily', 'weekly', 'biweekly', 'off')),
  channel    text not null default 'push'
             check (channel in ('push')),        -- extensible: 'email', 'native'
  updated_at timestamptz not null default now()
);

-- ── Existing push_subscriptions: ready it for native push later ───────────
alter table push_subscriptions
  add column if not exists platform text not null default 'web';

-- ── Digest log: idempotency — one digest per user per period, ever ────────
create table digest_log (
  user_id    uuid not null references profiles(id) on delete cascade,
  period_key text not null,                      -- e.g. 'daily-2026-07-02'
  sent_at    timestamptz not null default now(),
  primary key (user_id, period_key)
);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table notification_preferences enable row level security;
alter table digest_log               enable row level security;

create policy "own_prefs_all" on notification_preferences
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- digest_log: no client policies — service role only.

-- ── Hourly cron → send-digests edge function ──────────────────────────────
-- The function is idempotent (digest_log PK) and cadence-aware, so an hourly
-- tick is safe; it only sends inside each user's window and never twice.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-digests-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url     := 'https://kvwyhohsaucnjsqhvjvs.supabase.co/functions/v1/send-digests',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{"cron": true}'::jsonb
  );
  $$
);
