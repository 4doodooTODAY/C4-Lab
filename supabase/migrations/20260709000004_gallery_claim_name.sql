-- Gallery gate now captures first + last name AND phone (no email/account).
-- Replaces the phone-only claim_shoot_downloads with a name+phone version.
drop function if exists claim_shoot_downloads(text, text);

create or replace function claim_shoot_downloads(p_slug text, p_name text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_shoot_id uuid; v_lead_id uuid; v_claim_id uuid;
begin
  if coalesce(trim(p_phone), '') = '' or length(trim(p_phone)) < 7 then
    raise exception 'valid phone required';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;
  select id into v_shoot_id from one_off_shoots
    where slug = p_slug and active = true limit 1;
  if v_shoot_id is null then raise exception 'gallery not found or inactive'; end if;

  insert into shoot_leads (shoot_id, name, email, phone)
  values (v_shoot_id, trim(p_name), '', trim(p_phone))
  returning id into v_lead_id;

  insert into shoot_download_claims (shoot_id, lead_id)
  values (v_shoot_id, v_lead_id)
  returning id into v_claim_id;
  return v_claim_id;
end; $$;

grant execute on function claim_shoot_downloads(text, text, text) to anon;
