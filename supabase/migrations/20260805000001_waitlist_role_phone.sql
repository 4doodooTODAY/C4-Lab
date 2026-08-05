-- Applications from the sign-in screen (Creative / Visionary) land in the
-- waitlist table. Store the role and phone as real columns instead of packing
-- them into the notes text, and track review state so the team can work the
-- queue. No account exists until an admin invites them.

alter table waitlist add column if not exists role   text;
alter table waitlist add column if not exists phone  text;
alter table waitlist add column if not exists status text not null default 'pending';

-- pending: applied, waiting on the team. approved/declined: reviewed.
alter table waitlist drop constraint if exists waitlist_status_check;
alter table waitlist add constraint waitlist_status_check
  check (status in ('pending', 'approved', 'declined'));

create index if not exists idx_waitlist_status on waitlist(status);
