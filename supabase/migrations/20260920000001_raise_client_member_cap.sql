-- Raise client_members cap from 2 → 5 to support larger client teams
create or replace function enforce_client_member_cap()
returns trigger language plpgsql as $$
begin
  if (select count(*) from client_members where client_id = new.client_id) >= 5 then
    raise exception 'A client can have at most 5 login accounts.';
  end if;
  return new;
end; $$;
