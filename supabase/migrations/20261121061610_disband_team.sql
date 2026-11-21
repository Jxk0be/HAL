-- Captains can disband their own team: same effect as an admin deleting it (every player becomes
-- a free agent; deleted if it has no matches, otherwise kept as 'removed'). The shared work moves
-- into delete_team_core(), which only the two wrappers below can reach.

create function public.delete_team_core(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_players uuid[];
  v_has_matches boolean;
begin
  perform 1 from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(user_id), '{}') into v_players
    from public.team_members
   where team_id = p_team_id and left_at is null and not is_emergency;

  v_has_matches := exists (
    select 1 from public.matches m where p_team_id in (m.home_team_id, m.away_team_id)
  );

  if v_has_matches then
    -- hal.team_delete lets the roster guard drop the captain and skip roster limits;
    -- hal.roster_rpc lets a captain caller drop players directly.
    perform set_config('hal.team_delete', 'on', true);
    perform set_config('hal.roster_rpc', 'on', true);
    update public.team_members
       set left_at = now()
     where team_id = p_team_id and left_at is null and not is_emergency;
    perform set_config('hal.roster_rpc', '', true);
    perform set_config('hal.team_delete', '', true);
    perform set_config('hal.internal', 'on', true);
    update public.teams set status = 'removed', co_captain_id = null where id = p_team_id;
    perform set_config('hal.internal', '', true);
  else
    delete from public.teams where id = p_team_id;
    -- Deleting rows doesn't run the free agent sync (it fires on insert/update), so do it here.
    update public.profiles p
       set is_free_agent = true
     where p.id = any (v_players)
       and not p.is_free_agent
       and not exists (
         select 1 from public.team_members tm
          where tm.user_id = p.id and tm.left_at is null and not tm.is_emergency
       );
  end if;

  return jsonb_build_object(
    'deleted', not v_has_matches,
    'released', coalesce(array_length(v_players, 1), 0)
  );
end;
$$;
revoke execute on function public.delete_team_core(uuid) from public, anon, authenticated;

create or replace function public.admin_delete_team(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.teams where id = p_team_id) then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if not public.can_staff_team(p_team_id) then
    raise exception 'Only an admin who is not on this team can delete it' using errcode = '42501';
  end if;
  return public.delete_team_core(p_team_id);
end;
$$;

-- The captain (not the co-captain) disbands their own team. Captain actions aren't caught by the
-- audit trigger, so this writes its own public audit entry.
create function public.disband_team(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_result jsonb;
begin
  select * into v_team from public.teams where id = p_team_id;
  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if v_team.captain_id is distinct from (select auth.uid()) then
    raise exception 'Only the team captain can disband the team' using errcode = '42501';
  end if;
  if v_team.status = 'removed' then
    raise exception 'This team has already been removed from the league' using errcode = 'P0001';
  end if;

  v_result := public.delete_team_core(p_team_id);

  insert into public.audit_log (actor_id, actor_role, action, table_name, row_id, old_data, new_data)
  values ((select auth.uid()), 'captain', 'disbanded', 'teams', p_team_id::text,
          jsonb_build_object('name', v_team.name, 'tag', v_team.tag), v_result);
  return v_result;
end;
$$;

revoke execute on function public.disband_team(uuid) from public, anon;
grant execute on function public.disband_team(uuid) to authenticated;
