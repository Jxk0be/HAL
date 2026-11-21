-- Admins can delete a team. Every active player is released and becomes a free agent.
--  - No match history: the team row is deleted (rosters, invites, penalties cascade).
--  - Has matches: deleting would break opponents' results and standings, so the team is marked
--    'removed' instead and its roster emptied.
-- Either way the Discord sync deletes the team role and channel and moves players to Free Agent.

-- Roster guard: a team deletion (hal.team_delete) may drop the captain and doesn't use up roster
-- changes. Leaving a team the league removed doesn't trigger the 7-day same-division rule.
create or replace function public.team_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_season public.seasons;
  v_active int;
  v_role_count int;
  v_role_cap int;
  v_counts_as_change boolean;
  v_is_join boolean;
  v_is_drop boolean;
  v_roster_rpc boolean := coalesce(current_setting('hal.roster_rpc', true), '') = 'on';
  v_team_delete boolean := coalesce(current_setting('hal.team_delete', true), '') = 'on';
begin
  select * into v_team from public.teams where id = new.team_id;
  select * into v_season from public.seasons where id = v_team.season_id;
  new.season_id := v_team.season_id;

  v_is_join := tg_op = 'INSERT' and new.left_at is null;
  v_is_drop := tg_op = 'UPDATE' and old.left_at is null and new.left_at is not null;

  if tg_op = 'UPDATE' then
    if new.team_id <> old.team_id or new.user_id <> old.user_id then
      raise exception 'Move players by dropping and re-adding them' using errcode = 'P0001';
    end if;
    if old.left_at is not null and new.left_at is null then
      raise exception 'Re-add a dropped player with a new invite' using errcode = 'P0001';
    end if;
    -- Direct updates by captains (non-staff) may only switch starter/sub; drops use the RPCs.
    if not public.is_internal() and not v_roster_rpc and not public.can_staff_team(new.team_id)
       and (new.left_at is distinct from old.left_at
            or new.is_emergency is distinct from old.is_emergency
            or new.emergency_match_id is distinct from old.emergency_match_id
            or new.joined_at is distinct from old.joined_at) then
      raise exception 'Use Remove player or Leave team to change the roster' using errcode = '42501';
    end if;
  end if;

  if v_is_drop then
    if new.user_id = v_team.captain_id and not v_team_delete then
      raise exception 'Transfer the captaincy before the captain leaves' using errcode = 'P0001';
    end if;
    if new.user_id = v_team.co_captain_id then
      perform set_config('hal.internal', 'on', true);
      update public.teams set co_captain_id = null where id = v_team.id;
      perform set_config('hal.internal', '', true);
    end if;
  end if;

  if v_is_join then
    if v_team.status = 'removed' then
      raise exception 'This team has been removed from the league' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.profiles p where p.id = new.user_id and p.banned_until > now()) then
      raise exception 'This player is banned' using errcode = 'P0001';
    end if;

    if new.is_emergency then
      if not exists (
        select 1 from public.matches m
         where m.id = new.emergency_match_id and new.team_id in (m.home_team_id, m.away_team_id)
      ) then
        raise exception 'An emergency sub must be tied to one of this team''s matches' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from public.team_members tm
         where tm.season_id = new.season_id and tm.user_id = new.user_id
           and tm.left_at is null and not tm.is_emergency
      ) then
        raise exception 'Emergency subs must be free agents' using errcode = 'P0001';
      end if;
    else
      select count(*) into v_active
        from public.team_members tm
       where tm.team_id = new.team_id and tm.left_at is null and not tm.is_emergency;
      if v_active >= v_season.max_roster then
        raise exception 'Roster is full (max % players)', v_season.max_roster using errcode = 'P0001';
      end if;

      if exists (
        select 1 from public.team_members tm
         where tm.season_id = new.season_id and tm.user_id = new.user_id
           and tm.left_at is null and not tm.is_emergency
      ) then
        raise exception 'This player is already on a team this season' using errcode = 'P0001';
      end if;

      if v_team.division_id is not null and exists (
        select 1
          from public.team_members tm
          join public.teams t on t.id = tm.team_id
         where tm.user_id = new.user_id
           and t.division_id = v_team.division_id
           and t.id <> v_team.id
           and t.status <> 'removed'
           and tm.left_at > now() - interval '7 days'
      ) then
        raise exception 'A dropped player cannot join another team in the same division for 7 days'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Starter / sub caps, on joining or switching role.
  if not new.is_emergency and new.left_at is null
     and (v_is_join or (tg_op = 'UPDATE' and new.role is distinct from old.role)) then
    v_role_cap := case new.role when 'starter' then v_season.max_starters else v_season.max_subs end;
    select count(*) into v_role_count
      from public.team_members tm
     where tm.team_id = new.team_id and tm.left_at is null and not tm.is_emergency
       and tm.role = new.role and tm.id <> new.id;
    if v_role_count >= v_role_cap then
      raise exception '% spots are full (max %)',
        case new.role when 'starter' then 'Starter' else 'Sub' end, v_role_cap
        using errcode = 'P0001';
    end if;
  end if;

  -- Roster lock and roster-change limits (not for emergency spots or team deletions).
  if (v_is_join or v_is_drop) and not new.is_emergency and not v_team_delete then
    if v_season.roster_lock_at is not null and now() >= v_season.roster_lock_at
       and not public.is_internal() and not public.can_staff_team(new.team_id)
       and coalesce(current_setting('hal.staff_approved', true), '') <> 'on' then
      raise exception 'Rosters are locked for this season' using errcode = 'P0001';
    end if;

    -- Building the roster before the season starts is free; adds/drops in season count.
    v_counts_as_change := v_season.status in ('regular', 'playoffs')
                          and not (v_is_join and new.user_id = v_team.captain_id);
    if v_counts_as_change then
      if v_team.roster_changes_used >= v_season.max_roster_changes then
        raise exception 'No roster changes left (% per season)', v_season.max_roster_changes
          using errcode = 'P0001';
      end if;
      perform set_config('hal.internal', 'on', true);
      update public.teams set roster_changes_used = roster_changes_used + 1 where id = v_team.id;
      perform set_config('hal.internal', '', true);
    end if;
  end if;

  return new;
end;
$$;

create function public.admin_delete_team(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_players uuid[];
  v_has_matches boolean;
begin
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if not public.can_staff_team(p_team_id) then
    raise exception 'Only an admin who is not on this team can delete it' using errcode = '42501';
  end if;

  select coalesce(array_agg(user_id), '{}') into v_players
    from public.team_members
   where team_id = p_team_id and left_at is null and not is_emergency;

  v_has_matches := exists (
    select 1 from public.matches m where p_team_id in (m.home_team_id, m.away_team_id)
  );

  if v_has_matches then
    perform set_config('hal.team_delete', 'on', true);
    update public.team_members
       set left_at = now()
     where team_id = p_team_id and left_at is null and not is_emergency;
    perform set_config('hal.team_delete', '', true);
    update public.teams set status = 'removed', co_captain_id = null where id = p_team_id;
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

revoke execute on function public.admin_delete_team(uuid) from public, anon;
grant execute on function public.admin_delete_team(uuid) to authenticated;
