-- Anyone on the team can rename a project they work on. Clients cannot.
--
-- The projects UPDATE policies only let creatives/editors through when they
-- are the project's creative_id or editor_id, which misses the multi-editor
-- table and people assigned at the client level. Rather than widen UPDATE on
-- the whole row, this function changes the name and nothing else.
create or replace function rename_project(p_project_id uuid, p_name text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_role text;
begin
  select role::text into v_role from profiles where id = auth.uid();
  if v_role is null or v_role not in ('admin', 'creative', 'editor') then
    raise exception 'Only the team can rename projects.';
  end if;
  if v_name = '' then raise exception 'Project name cannot be empty.'; end if;
  if length(v_name) > 200 then raise exception 'Project name is too long.'; end if;

  if v_role <> 'admin' and not exists (
    select 1 from projects p
    where p.id = p_project_id
      and (p.creative_id = auth.uid()
        or p.editor_id = auth.uid()
        or exists (select 1 from project_editors pe where pe.project_id = p.id and pe.profile_id = auth.uid())
        or exists (select 1 from client_creatives cc where cc.client_id = p.client_id and cc.profile_id = auth.uid()))
  ) then
    raise exception 'You are not on this project.';
  end if;

  update projects set name = v_name where id = p_project_id;
  if not found then raise exception 'Project not found.'; end if;
  return v_name;
end; $$;

revoke all on function rename_project(uuid, text) from public, anon;
grant execute on function rename_project(uuid, text) to authenticated;
