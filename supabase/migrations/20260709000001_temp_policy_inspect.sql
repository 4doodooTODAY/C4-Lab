create or replace function _tmp_inspect_policies(p_table text)
returns table(policyname text, cmd text, roles text[], qual text, with_check text)
language sql security definer set search_path = public as $$
  select policyname::text, cmd::text, roles, qual, with_check
  from pg_policies where schemaname='public' and tablename=p_table;
$$;
grant execute on function _tmp_inspect_policies(text) to service_role;
