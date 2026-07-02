-- Cut (project_revisions) state machine with DB-enforced guards.
--
-- States: draft → (explicit send) pending_creative_review / pending_admin_review
--         / pending_client_review → approved | pending_editor (revisions
--         requested = unlocked) → resend...
--
-- Rules enforced HERE (not just UI):
--   1. Files (video_url / photo_urls) are only mutable while the cut is
--      unlocked: status 'draft' or 'pending_editor'.
--   2. Deletes only while unlocked.
--   3. Status changes must follow the allowed transitions.
--   Admins are exempt from the file lock (escape hatch) but not from
--   transition sanity. Service-role/backend contexts (auth.uid() is null)
--   bypass, so edge functions and SQL maintenance keep working.

-- ⚠️ FLAGGED: replaces the status CHECK constraint (adds 'draft', keeps all
-- existing statuses — no existing row becomes invalid).
alter table project_revisions drop constraint if exists project_revisions_status_check;
alter table project_revisions add constraint project_revisions_status_check
  check (status in (
    'draft',                       -- uploaded, NOT yet sent anywhere
    'pending_creative_review',
    'pending_photographer_review',
    'pending_admin_review',
    'pending_client_review',
    'pending_editor',
    'approved'
  ));

create or replace function enforce_cut_transitions()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
  v_unlocked boolean;
begin
  -- Backend/service contexts bypass (they carry no auth.uid()).
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  select role into v_role from profiles where id = auth.uid();

  if tg_op = 'DELETE' then
    if old.status in ('draft', 'pending_editor') or v_role = 'admin' then
      return old;
    end if;
    raise exception 'This cut is with the client for review and is locked. It unlocks if the client requests revisions.';
  end if;

  -- UPDATE
  v_unlocked := old.status in ('draft', 'pending_editor');

  -- 1. File replacement guard
  if (new.video_url  is distinct from old.video_url
   or new.photo_urls is distinct from old.photo_urls) then
    if not v_unlocked and v_role <> 'admin' then
      raise exception 'This cut is locked while in review. It unlocks if the client requests revisions.';
    end if;
  end if;

  -- 2. Transition guard (applies to everyone incl. admins — keeps states sane)
  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft'                        and new.status in ('pending_creative_review','pending_photographer_review','pending_admin_review','pending_client_review')) or
      (old.status = 'pending_creative_review'      and new.status in ('pending_admin_review','pending_client_review','pending_editor')) or
      (old.status = 'pending_photographer_review'  and new.status in ('pending_admin_review','pending_client_review','pending_editor')) or
      (old.status = 'pending_admin_review'         and new.status in ('pending_client_review','pending_editor')) or
      (old.status = 'pending_client_review'        and new.status in ('approved','pending_editor')) or
      (old.status = 'pending_editor'               and new.status in ('draft','pending_creative_review','pending_photographer_review','pending_admin_review','pending_client_review')) or
      -- Admin-only: reopen an approved cut or force-return anything
      (v_role = 'admin'                            and new.status in ('pending_editor','draft'))
    ) then
      raise exception 'Invalid cut transition: % → %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cut_transitions on project_revisions;
create trigger trg_cut_transitions
  before update or delete on project_revisions
  for each row execute function enforce_cut_transitions();
