-- Clients can now have any number of login accounts (was capped at 2).
-- Membership adds and removals go through the create-user edge function
-- (add_client_member / remove_client_member), which also keeps one person to
-- one client so getMyClient() always resolves a single portal.
drop trigger if exists trg_client_member_cap on client_members;
drop function if exists enforce_client_member_cap();

create index if not exists client_members_profile_idx on client_members (profile_id);
