-- HAL: league rule triggers, RLS policies, public views, column privileges and RPCs.
-- Convention: triggers let the service role (auth.uid() is null: Edge Functions, bot, migrations)
-- through, and use the transaction-local flag hal.internal for writes made by our own functions.

create function public.is_internal()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is null or coalesce(current_setting('hal.internal', true), '') = 'on';
$$;

create function public.match_captain_team(p_match_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- The caller's captained team in this match (null if they captain neither side).
  select case
           when public.is_captain_of(m.home_team_id) then m.home_team_id
           when public.is_captain_of(m.away_team_id) then m.away_team_id
         end
    from public.matches m
   where m.id = p_match_id;
$$;

-- ===========================================================================
-- Profiles
-- ===========================================================================
create function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_internal() then
    return new;
  end if;
  if new.banned_until is distinct from old.banned_until
     and (not public.is_admin() or old.id = (select auth.uid())) then
    raise exception 'Only league staff can change bans' using errcode = '42501';
  end if;
  if new.age_confirmed_at is distinct from old.age_confirmed_at then
    if old.age_confirmed_at is not null then
      raise exception 'Age confirmation cannot be changed once given' using errcode = '42501';
    end if;
    new.age_confirmed_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- discord_id is private: hide it from the API with column privileges.
revoke select, insert, update, delete on public.profiles from anon, authenticated;
grant select (id, discord_username, avatar_url, activision_id, platform, age_confirmed_at,
              is_free_agent, banned_until, created_at, updated_at)
  on public.profiles to anon, authenticated;
grant update (activision_id, platform, age_confirmed_at, is_free_agent, banned_until)
  on public.profiles to authenticated;

create policy "profiles are public" on public.profiles
  for select to anon, authenticated using (true);
create policy "users update own profile, staff any" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

create view public.profiles_public
with (security_invoker = true) as
  select id, discord_username, avatar_url, activision_id, platform, is_free_agent, banned_until, created_at
    from public.profiles;
grant select on public.profiles_public to anon, authenticated;

-- ===========================================================================
-- Staff roles, seasons, divisions, game data, settings
-- ===========================================================================
create policy "staff roles are public" on public.staff_roles
  for select to anon, authenticated using (true);
create policy "owner grants roles" on public.staff_roles
  for insert to authenticated with check ((select public.is_owner()));
create policy "owner revokes roles" on public.staff_roles
  for delete to authenticated using ((select public.is_owner()));

create policy "seasons are public once out of draft" on public.seasons
  for select to anon, authenticated using (status <> 'draft' or (select public.is_admin()));
create policy "owner manages seasons" on public.seasons
  for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

create policy "divisions are public" on public.divisions
  for select to anon, authenticated using (true);
create policy "owner manages divisions" on public.divisions
  for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

do $$
declare
  t text;
begin
  foreach t in array array['game_modes', 'maps', 'map_modes', 'gentlemens_agreements'] loop
    execute format('create policy "%s are public" on public.%I for select to anon, authenticated using (true)', t, t);
    execute format('create policy "admins manage %s" on public.%I for all to authenticated
                      using ((select public.is_admin())) with check ((select public.is_admin()))', t, t);
  end loop;
end;
$$;

create policy "staff read settings" on public.app_settings
  for select to authenticated using ((select public.is_admin()));
create policy "owner manages settings" on public.app_settings
  for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

-- ===========================================================================
-- Teams
-- ===========================================================================
create function public.teams_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
begin
  if public.is_internal() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if public.is_admin() then
      return new;
    end if;
    select * into v_season from public.seasons where id = new.season_id;
    if v_season.status not in ('signups', 'regular') then
      raise exception 'Team registration is closed for this season' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.profiles p where p.id = new.captain_id and p.banned_until > now()) then
      raise exception 'Banned players cannot create teams' using errcode = 'P0001';
    end if;
    new.status := 'pending';
    new.division_id := null;
    new.roster_changes_used := 0;
    new.forfeit_count := 0;
    new.discord_role_id := null;
    new.discord_channel_id := null;
    return new;
  end if;

  -- UPDATE
  if new.co_captain_id is not null and new.co_captain_id is distinct from old.co_captain_id
     and not exists (
       select 1 from public.team_members tm
        where tm.team_id = new.id and tm.user_id = new.co_captain_id
          and tm.left_at is null and not tm.is_emergency
     ) then
    raise exception 'The co-captain must be on the roster' using errcode = 'P0001';
  end if;

  if public.can_staff_team(old.id) then
    return new;
  end if;

  -- Captains may edit presentation fields only.
  if new.season_id is distinct from old.season_id
     or new.division_id is distinct from old.division_id
     or new.status is distinct from old.status
     or new.captain_id is distinct from old.captain_id
     or new.roster_changes_used is distinct from old.roster_changes_used
     or new.forfeit_count is distinct from old.forfeit_count
     or new.discord_role_id is distinct from old.discord_role_id
     or new.discord_channel_id is distinct from old.discord_channel_id then
    raise exception 'Captains can only change the team name, tag, logo and co-captain' using errcode = '42501';
  end if;
  if old.status = 'removed' then
    raise exception 'This team has been removed from the league' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger teams_guard before insert or update on public.teams
  for each row execute function public.teams_guard();

-- The captain is the first starter on a new team.
create function public.teams_add_captain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.team_members (team_id, season_id, user_id, role)
  values (new.id, new.season_id, new.captain_id, 'starter');
  return new;
end;
$$;

create trigger teams_add_captain after insert on public.teams
  for each row execute function public.teams_add_captain();

create policy "teams are public" on public.teams
  for select to anon, authenticated using (true);
create policy "players create a team they captain" on public.teams
  for insert to authenticated
  with check (captain_id = (select auth.uid()) or (select public.is_admin()));
create policy "captains and staff update teams" on public.teams
  for update to authenticated
  using ((select auth.uid()) in (captain_id, co_captain_id) or (select public.can_staff_team(id)))
  with check ((select auth.uid()) in (captain_id, co_captain_id) or (select public.can_staff_team(id)));
create policy "staff delete teams" on public.teams
  for delete to authenticated using ((select public.can_staff_team(id)));

-- ===========================================================================
-- Team members (roster rules)
-- ===========================================================================
create function public.team_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_season public.seasons;
  v_active int;
  v_counts_as_change boolean;
  v_is_join boolean;
  v_is_drop boolean;
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
      raise exception 'Re-add a dropped player with a new roster entry' using errcode = 'P0001';
    end if;
    -- Captains (non-staff) may only switch starter/sub.
    if not public.is_internal() and not public.can_staff_team(new.team_id)
       and (new.left_at is distinct from old.left_at
            or new.is_emergency is distinct from old.is_emergency
            or new.emergency_match_id is distinct from old.emergency_match_id
            or new.joined_at is distinct from old.joined_at) then
      raise exception 'Roster adds and drops go through a roster request' using errcode = '42501';
    end if;
  end if;

  if v_is_drop then
    if new.user_id in (v_team.captain_id) then
      raise exception 'Transfer the captaincy before dropping the captain' using errcode = 'P0001';
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
           and tm.left_at > now() - interval '7 days'
      ) then
        raise exception 'A dropped player cannot join another team in the same division for 7 days'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Roster lock and roster-change limits (not for emergency spots).
  if (v_is_join or v_is_drop) and not new.is_emergency then
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

create trigger team_members_guard before insert or update on public.team_members
  for each row execute function public.team_members_guard();

create policy "rosters are public" on public.team_members
  for select to anon, authenticated using (true);
create policy "staff add roster entries" on public.team_members
  for insert to authenticated with check ((select public.can_staff_team(team_id)));
create policy "captains and staff update roster entries" on public.team_members
  for update to authenticated
  using ((select public.is_captain_of(team_id)) or (select public.can_staff_team(team_id)))
  with check ((select public.is_captain_of(team_id)) or (select public.can_staff_team(team_id)));
create policy "staff delete roster entries" on public.team_members
  for delete to authenticated using ((select public.can_staff_team(team_id)));

-- ===========================================================================
-- Roster requests (adds, drops, emergency subs) -> admin approval
-- ===========================================================================
create function public.roster_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_season public.seasons;
  v_active int;
  v_pending int;
  v_eligible int;
  v_match public.matches;
begin
  select * into v_team from public.teams where id = new.team_id;
  select * into v_season from public.seasons where id = v_team.season_id;

  if tg_op = 'INSERT' then
    if not public.is_internal() then
      new.requested_by := (select auth.uid());
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;

    if new.type = 'emergency_sub' then
      select * into v_match from public.matches where id = new.match_id;
      if v_match.id is null or new.team_id not in (v_match.home_team_id, v_match.away_team_id) then
        raise exception 'An emergency sub request must name one of this team''s matches' using errcode = 'P0001';
      end if;
      select count(*) into v_eligible
        from public.team_members tm
       where tm.team_id = new.team_id and tm.left_at is null and not tm.is_emergency
         and tm.joined_at <= v_match.scheduled_at - interval '24 hours';
      if v_eligible >= 4 then
        raise exception 'Emergency subs are only for teams with fewer than 4 eligible players' using errcode = 'P0001';
      end if;
    elsif new.type = 'add' then
      select count(*) into v_active
        from public.team_members tm
       where tm.team_id = new.team_id and tm.left_at is null and not tm.is_emergency;
      select count(*) into v_pending
        from public.roster_requests rr
       where rr.team_id = new.team_id and rr.type = 'add' and rr.status = 'pending';
      if v_active + v_pending >= v_season.max_roster then
        raise exception 'Roster is full (max % players, including pending adds)', v_season.max_roster
          using errcode = 'P0001';
      end if;
      if exists (
        select 1 from public.team_members tm
         where tm.season_id = v_team.season_id and tm.user_id = new.user_id
           and tm.left_at is null and not tm.is_emergency
      ) then
        raise exception 'This player is already on a team this season' using errcode = 'P0001';
      end if;
    elsif new.type = 'drop' then
      if not exists (
        select 1 from public.team_members tm
         where tm.team_id = new.team_id and tm.user_id = new.user_id and tm.left_at is null
      ) then
        raise exception 'That player is not on this roster' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE (review)
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'This request has already been reviewed' using errcode = 'P0001';
  end if;
  if new.team_id <> old.team_id or new.user_id <> old.user_id or new.type <> old.type
     or new.match_id is distinct from old.match_id or new.requested_by <> old.requested_by then
    raise exception 'Only the status and note of a request can change' using errcode = 'P0001';
  end if;
  if new.status <> old.status and not public.is_internal() then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

create trigger roster_requests_guard before insert or update on public.roster_requests
  for each row execute function public.roster_requests_guard();

-- Apply an approved request to the roster (runs as definer; rules still apply in team_members_guard).
create function public.roster_requests_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;
  perform set_config('hal.staff_approved', 'on', true);
  if new.type = 'add' then
    insert into public.team_members (team_id, season_id, user_id, role)
    values (new.team_id, (select season_id from public.teams where id = new.team_id), new.user_id, 'sub');
  elsif new.type = 'drop' then
    update public.team_members
       set left_at = now()
     where team_id = new.team_id and user_id = new.user_id and left_at is null;
  elsif new.type = 'emergency_sub' then
    insert into public.team_members (team_id, season_id, user_id, role, is_emergency, emergency_match_id)
    values (new.team_id, (select season_id from public.teams where id = new.team_id), new.user_id, 'sub', true, new.match_id);
  end if;
  perform set_config('hal.staff_approved', '', true);
  return new;
end;
$$;

create trigger roster_requests_apply after update on public.roster_requests
  for each row execute function public.roster_requests_apply();

create policy "captains, the player and staff read roster requests" on public.roster_requests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_captain_of(team_id))
    or (select public.is_admin())
  );
create policy "captains request roster changes; players request their own drop" on public.roster_requests
  for insert to authenticated
  with check (
    (select public.is_captain_of(team_id))
    or (type = 'drop' and user_id = (select auth.uid()))
  );
create policy "staff review roster requests (recused from own team and matches)" on public.roster_requests
  for update to authenticated
  using (
    case when match_id is not null then (select public.can_staff_match(match_id))
         else (select public.can_staff_team(team_id)) end
  )
  with check (
    case when match_id is not null then (select public.can_staff_match(match_id))
         else (select public.can_staff_team(team_id)) end
  );
create policy "requesters withdraw pending requests" on public.roster_requests
  for delete to authenticated
  using (requested_by = (select auth.uid()) and status = 'pending');

-- ===========================================================================
-- Matches and results
-- ===========================================================================
create policy "matches are public" on public.matches
  for select to anon, authenticated using (true);
create policy "staff create matches between teams they are not on" on public.matches
  for insert to authenticated
  with check (
    (select public.is_admin())
    and not (select public.is_on_team(home_team_id))
    and not (select public.is_on_team(away_team_id))
  );
create policy "staff update matches (recused)" on public.matches
  for update to authenticated
  using ((select public.can_staff_match(id)))
  with check (
    (select public.can_staff_match(id))
    and not (select public.is_on_team(home_team_id))
    and not (select public.is_on_team(away_team_id))
  );
create policy "staff delete matches (recused)" on public.matches
  for delete to authenticated using ((select public.can_staff_match(id)));

create policy "match maps are public" on public.match_maps
  for select to anon, authenticated using (true);
create policy "staff write match maps (recused)" on public.match_maps
  for all to authenticated
  using ((select public.can_staff_match(match_id)))
  with check ((select public.can_staff_match(match_id)));

create policy "confirmed stats are public" on public.player_map_stats
  for select to anon, authenticated using (true);
create policy "staff write stats (recused)" on public.player_map_stats
  for all to authenticated
  using ((select public.can_staff_match(public.match_of_map(match_map_id))))
  with check ((select public.can_staff_match(public.match_of_map(match_map_id))));

create policy "parties and staff read mismatches" on public.stat_mismatches
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.is_party_to_match(public.match_of_map(match_map_id)))
  );
create policy "staff resolve mismatches (recused)" on public.stat_mismatches
  for all to authenticated
  using ((select public.can_staff_match(public.match_of_map(match_map_id))))
  with check ((select public.can_staff_match(public.match_of_map(match_map_id))));

-- Report submissions: each captain upserts their own team's report until the match is settled.
create function public.report_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_internal() or public.can_staff_match(new.match_id) then
    return new;
  end if;
  new.submitted_by := (select auth.uid());
  new.submitted_at := now();
  if exists (
    select 1 from public.matches m
     where m.id = new.match_id and m.status in ('confirmed', 'forfeit', 'cancelled')
  ) then
    raise exception 'This match is already settled; open a dispute instead' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger report_submissions_guard before insert or update on public.report_submissions
  for each row execute function public.report_submissions_guard();

create policy "parties and staff read reports" on public.report_submissions
  for select to authenticated
  using ((select public.is_admin()) or (select public.is_party_to_match(match_id)));
create policy "captains submit their team's report" on public.report_submissions
  for insert to authenticated
  with check ((select public.is_captain_in_match(match_id, team_id)));
create policy "captains update their team's report; staff any (recused)" on public.report_submissions
  for update to authenticated
  using ((select public.is_captain_in_match(match_id, team_id)) or (select public.can_staff_match(match_id)))
  with check ((select public.is_captain_in_match(match_id, team_id)) or (select public.can_staff_match(match_id)));
create policy "staff delete reports (recused)" on public.report_submissions
  for delete to authenticated using ((select public.can_staff_match(match_id)));

-- ===========================================================================
-- Check-ins
-- ===========================================================================
create function public.checkins_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
  v_ok int;
  v_staff boolean;
begin
  select * into v_match from public.matches where id = new.match_id;
  v_staff := public.is_internal() or public.can_staff_match(new.match_id);

  if (select count(distinct p) from unnest(new.player_ids) p) <> 4 then
    raise exception 'Check in exactly 4 different players' using errcode = 'P0001';
  end if;

  -- Every player: active on this team (non-emergency, on the roster 24h before the match)
  -- or an approved emergency sub for this match.
  select count(distinct tm.user_id) into v_ok
    from public.team_members tm
   where tm.team_id = new.team_id
     and tm.user_id = any (new.player_ids)
     and tm.left_at is null
     and (
       (not tm.is_emergency and tm.joined_at <= v_match.scheduled_at - interval '24 hours')
       or (tm.is_emergency and tm.emergency_match_id = new.match_id)
     );
  if v_ok <> 4 then
    raise exception 'All 4 players must be on the roster at least 24 hours before the match (or approved emergency subs)'
      using errcode = 'P0001';
  end if;

  if not v_staff then
    new.captain_id := (select auth.uid());
    if v_match.status not in ('scheduled', 'checkin_open') then
      raise exception 'Check-in is closed for this match' using errcode = 'P0001';
    end if;
    if now() < v_match.scheduled_at - interval '15 minutes' then
      raise exception 'Check-in opens 15 minutes before the match' using errcode = 'P0001';
    end if;
    if now() > v_match.scheduled_at + interval '30 minutes' then
      raise exception 'Check-in has closed (30 minutes late is a series forfeit)' using errcode = 'P0001';
    end if;
    new.checked_in_at := now();
  end if;
  return new;
end;
$$;

create trigger checkins_guard before insert or update on public.checkins
  for each row execute function public.checkins_guard();

create policy "parties and staff read check-ins" on public.checkins
  for select to authenticated
  using ((select public.is_admin()) or (select public.is_party_to_match(match_id)));
create policy "captains check in their team" on public.checkins
  for insert to authenticated
  with check ((select public.is_captain_in_match(match_id, team_id)) or (select public.can_staff_match(match_id)));
create policy "captains update their check-in; staff any (recused)" on public.checkins
  for update to authenticated
  using ((select public.is_captain_in_match(match_id, team_id)) or (select public.can_staff_match(match_id)))
  with check ((select public.is_captain_in_match(match_id, team_id)) or (select public.can_staff_match(match_id)));
create policy "staff delete check-ins (recused)" on public.checkins
  for delete to authenticated using ((select public.can_staff_match(match_id)));

-- ===========================================================================
-- Reschedule requests
-- ===========================================================================
create function public.reschedule_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
  v_tz text;
  v_week_start timestamp;
  v_my_team uuid;
  v_staff boolean;
begin
  select * into v_match from public.matches where id = new.match_id;
  select timezone into v_tz from public.seasons where id = v_match.season_id;
  v_staff := public.is_internal() or public.can_staff_match(new.match_id);
  v_my_team := public.match_captain_team(new.match_id);

  if tg_op = 'INSERT' then
    -- League week = Monday 00:00 to Sunday 23:59 in the league timezone, of the default time.
    v_week_start := date_trunc('week', v_match.default_at at time zone v_tz);
    if new.proposed_at < (v_week_start at time zone v_tz)
       or new.proposed_at >= ((v_week_start + interval '7 days') at time zone v_tz) then
      raise exception 'The new time must be in the same week, by Sunday 11:59 PM ET' using errcode = 'P0001';
    end if;
    if not v_staff then
      if v_my_team is null or v_my_team <> new.requested_by_team_id then
        raise exception 'Only a captain in this match can request a reschedule' using errcode = '42501';
      end if;
      if now() > v_match.default_at - interval '24 hours' then
        raise exception 'Reschedules must be agreed at least 24 hours before the default time' using errcode = 'P0001';
      end if;
      if new.proposed_at <= now() then
        raise exception 'The new time must be in the future' using errcode = 'P0001';
      end if;
      new.requested_by := (select auth.uid());
      new.status := 'pending';
      new.responded_by := null;
      new.responded_at := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.match_id <> old.match_id or new.requested_by_team_id <> old.requested_by_team_id
     or new.requested_by <> old.requested_by or new.proposed_at <> old.proposed_at then
    raise exception 'Only the status of a reschedule request can change' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'This request is no longer pending' using errcode = 'P0001';
    end if;
    if not v_staff then
      if v_my_team = old.requested_by_team_id then
        if new.status <> 'cancelled' then
          raise exception 'The requesting team can only cancel its request' using errcode = '42501';
        end if;
      elsif v_my_team is not null then
        if new.status not in ('accepted', 'declined') then
          raise exception 'Accept or decline the request' using errcode = '42501';
        end if;
        if new.status = 'accepted' and now() > v_match.default_at - interval '24 hours' then
          raise exception 'Too late: reschedules must be agreed 24 hours before the default time' using errcode = 'P0001';
        end if;
      else
        raise exception 'Only the captains in this match can respond' using errcode = '42501';
      end if;
    end if;
    if not public.is_internal() then
      new.responded_by := (select auth.uid());
      new.responded_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger reschedule_requests_guard before insert or update on public.reschedule_requests
  for each row execute function public.reschedule_requests_guard();

create function public.reschedule_requests_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    update public.matches set scheduled_at = new.proposed_at where id = new.match_id;
  end if;
  return new;
end;
$$;

create trigger reschedule_requests_apply after update on public.reschedule_requests
  for each row execute function public.reschedule_requests_apply();

create policy "reschedule requests are public" on public.reschedule_requests
  for select to anon, authenticated using (true);
create policy "captains request reschedules" on public.reschedule_requests
  for insert to authenticated
  with check ((select public.is_captain_in_match(match_id, requested_by_team_id)) or (select public.can_staff_match(match_id)));
create policy "captains respond; staff any (recused)" on public.reschedule_requests
  for update to authenticated
  using ((select public.match_captain_team(match_id)) is not null or (select public.can_staff_match(match_id)))
  with check ((select public.match_captain_team(match_id)) is not null or (select public.can_staff_match(match_id)));

-- ===========================================================================
-- Disputes
-- ===========================================================================
create function public.disputes_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
begin
  if public.is_internal() or public.can_staff_match(new.match_id) then
    if tg_op = 'UPDATE' and new.status = 'resolved' and old.status <> 'resolved' then
      new.resolved_by := coalesce((select auth.uid()), new.resolved_by);
      new.resolved_at := now();
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Only league staff can update disputes' using errcode = '42501';
  end if;

  select * into v_match from public.matches where id = new.match_id;
  if now() > greatest(v_match.scheduled_at, coalesce(v_match.confirmed_at, v_match.scheduled_at)) + interval '24 hours' then
    raise exception 'Disputes must be opened within 24 hours of the match' using errcode = 'P0001';
  end if;
  new.opened_by := (select auth.uid());
  new.status := 'open';
  new.resolution := null;
  new.resolved_by := null;
  new.resolved_at := null;
  new.discord_thread_id := null;
  return new;
end;
$$;

create trigger disputes_guard before insert or update on public.disputes
  for each row execute function public.disputes_guard();

-- discord_thread_id stays server-side (bot uses the service role).
revoke select, insert, update on public.disputes from anon, authenticated;
grant select (id, match_id, team_id, opened_by, reason, status, resolution, resolved_by, resolved_at,
              created_at, updated_at)
  on public.disputes to anon, authenticated;
grant insert (match_id, team_id, reason) on public.disputes to authenticated;
grant update (status, resolution) on public.disputes to authenticated;

create policy "disputes are public (without evidence)" on public.disputes
  for select to anon, authenticated using (true);
create policy "captains open disputes for their matches" on public.disputes
  for insert to authenticated
  with check ((select public.is_captain_in_match(match_id, team_id)));
create policy "staff resolve disputes (recused)" on public.disputes
  for update to authenticated
  using ((select public.can_staff_match(match_id)))
  with check ((select public.can_staff_match(match_id)));
create policy "staff delete disputes (recused)" on public.disputes
  for delete to authenticated using ((select public.can_staff_match(match_id)));

create view public.disputes_public
with (security_invoker = true) as
  select id, match_id, team_id, opened_by, reason, status, resolution, resolved_by, resolved_at, created_at
    from public.disputes;
grant select on public.disputes_public to anon, authenticated;

create function public.match_of_dispute(p_dispute_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select match_id from public.disputes where id = p_dispute_id;
$$;

create policy "parties and staff read evidence" on public.dispute_evidence
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.is_party_to_match(public.match_of_dispute(dispute_id)))
  );
create policy "parties add evidence" on public.dispute_evidence
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and (
      (select public.is_party_to_match(public.match_of_dispute(dispute_id)))
      or (select public.can_staff_match(public.match_of_dispute(dispute_id)))
    )
  );
create policy "staff remove evidence (recused)" on public.dispute_evidence
  for delete to authenticated
  using ((select public.can_staff_match(public.match_of_dispute(dispute_id))));

-- ===========================================================================
-- Free agents, penalties, audit log
-- ===========================================================================
create policy "free agent posts are public" on public.free_agent_posts
  for select to anon, authenticated using (true);
create policy "players post themselves" on public.free_agent_posts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "players edit own posts; staff any" on public.free_agent_posts
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "players delete own posts; staff any" on public.free_agent_posts
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create function public.penalties_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_internal() then
    return new;
  end if;
  new.issued_by := (select auth.uid());
  if new.user_id = (select auth.uid()) then
    raise exception 'Staff cannot penalise themselves' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger penalties_guard before insert or update on public.penalties
  for each row execute function public.penalties_guard();

create policy "penalties are public" on public.penalties
  for select to anon, authenticated using (true);
create policy "staff issue penalties (recused)" on public.penalties
  for all to authenticated
  using (
    (select public.is_admin())
    and (team_id is null or (select public.can_staff_team(team_id)))
    and (match_id is null or (select public.can_staff_match(match_id)))
  )
  with check (
    (select public.is_admin())
    and (team_id is null or (select public.can_staff_team(team_id)))
    and (match_id is null or (select public.can_staff_match(match_id)))
  );

-- Audit log: public read; written only by SECURITY DEFINER code (step 3 adds the triggers).
create policy "audit log is public" on public.audit_log
  for select to anon, authenticated using (true);
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- ===========================================================================
-- RPC: casters (and admins) toggle the broadcast, nothing else on a match
-- ===========================================================================
create function public.set_broadcast(p_match_id uuid, p_live boolean, p_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.matches;
  v_new public.matches;
  v_uid uuid := (select auth.uid());
begin
  if not (public.is_caster() or public.is_admin()) then
    raise exception 'Only casters and admins can set a broadcast' using errcode = '42501';
  end if;
  if public.is_party_to_match(p_match_id) then
    raise exception 'You cannot take staff actions on your own team''s match' using errcode = '42501';
  end if;
  if p_live and (p_url is null or p_url !~ '^https://') then
    raise exception 'A live broadcast needs an https:// stream link' using errcode = 'P0001';
  end if;

  select * into v_old from public.matches where id = p_match_id for update;
  if v_old.id is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;

  update public.matches
     set broadcast_live = p_live,
         broadcast_url = case when p_live then p_url else broadcast_url end,
         broadcast_by = v_uid
   where id = p_match_id
  returning * into v_new;

  insert into public.audit_log (actor_id, actor_role, action, table_name, row_id, old_data, new_data)
  values (
    v_uid,
    case when public.is_admin() then 'admin' else 'caster' end,
    case when p_live then 'broadcast_start' else 'broadcast_end' end,
    'matches',
    p_match_id::text,
    jsonb_build_object('broadcast_live', v_old.broadcast_live, 'broadcast_url', v_old.broadcast_url),
    jsonb_build_object('broadcast_live', v_new.broadcast_live, 'broadcast_url', v_new.broadcast_url)
  );
end;
$$;

revoke execute on function public.set_broadcast(uuid, boolean, text) from public, anon;
grant execute on function public.set_broadcast(uuid, boolean, text) to authenticated;

-- Trigger functions are not API surface.
revoke execute on function
  public.profiles_guard(), public.teams_guard(), public.teams_add_captain(),
  public.team_members_guard(), public.roster_requests_guard(), public.roster_requests_apply(),
  public.report_submissions_guard(), public.checkins_guard(), public.reschedule_requests_guard(),
  public.reschedule_requests_apply(), public.disputes_guard(), public.penalties_guard()
  from public, anon, authenticated;
