-- Waitlist captures name + optional notes (e.g. what area they work in).
alter table waitlist add column if not exists name  text;
alter table waitlist add column if not exists notes text;
