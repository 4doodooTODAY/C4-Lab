-- Rate limiting for the public edge functions.
--
-- join-waitlist and the forgot-password action are reachable with no login. A
-- bot can hammer either one to spam the waitlist table, burn the Resend quota,
-- or mail-bomb somebody. Edge functions are stateless and run on many isolates,
-- so an in-memory counter does not hold. This keeps the counters in Postgres
-- where every isolate sees the same numbers.
--
-- Callers use check_rate_limit(), which is atomic: the upsert takes a row lock,
-- so two concurrent requests cannot both read a stale count.

create table if not exists rate_limits (
  bucket       text        not null,
  identifier   text        not null,
  window_start timestamptz not null default now(),
  hits         integer     not null default 0,
  primary key (bucket, identifier)
);

comment on table rate_limits is
  'Fixed-window counters for public endpoints. Identifiers are hashed, never raw IPs or emails.';

-- Deny-all by default. Only the service role, which bypasses RLS, touches this.
alter table rate_limits enable row level security;

-- Returns true when the request is allowed, false when the caller is over the
-- limit. Always counts the hit, so a caller who keeps hammering while blocked
-- keeps the window alive rather than sneaking through on the boundary.
create or replace function check_rate_limit(
  p_bucket         text,
  p_identifier     text,
  p_max_hits       integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
  v_cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
begin
  insert into rate_limits (bucket, identifier, window_start, hits)
  values (p_bucket, p_identifier, now(), 1)
  on conflict (bucket, identifier) do update
    set hits = case
                 when rate_limits.window_start < v_cutoff then 1
                 else rate_limits.hits + 1
               end,
        window_start = case
                 when rate_limits.window_start < v_cutoff then now()
                 else rate_limits.window_start
               end
  returning hits into v_hits;

  -- Opportunistic cleanup so the table does not grow forever. Roughly one
  -- request in a hundred pays for it, and only for rows nobody is counting.
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_max_hits;
end;
$$;

-- security definer means this runs as the owner, so lock down who can call it.
revoke all on function check_rate_limit(text, text, integer, integer) from public;
revoke all on function check_rate_limit(text, text, integer, integer) from anon, authenticated;
grant execute on function check_rate_limit(text, text, integer, integer) to service_role;
