-- Step 15: admin panel.
--
-- Every function here checks recusal itself (can_staff_match / can_staff_team) and raises 42501
-- with a readable message, so the UI can show the database's answer. Staff writes are audit-logged
-- by the audit_staff_change() trigger as usual; derived map/stat rows written while settling a
-- mismatch skip the log (hal.no_audit) because the mismatch update itself is the record.

-- ---------------------------------------------------------------------------
-- Overview
-- ---------------------------------------------------------------------------
create function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week_start timestamptz := (date_trunc('week', now() at time zone 'America/New_York')) at time zone 'America/New_York';
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'open_mismatch_matches', (
      select count(distinct mm.match_id) from public.stat_mismatches s
        join public.match_maps mm on mm.id = s.match_map_id where s.resolved_at is null),
    'open_mismatch_fields', (select count(*) from public.stat_mismatches where resolved_at is null),
    'open_disputes', (select count(*) from public.disputes where status = 'open'),
    'pending_roster_requests', (select count(*) from public.roster_requests where status = 'pending'),
    'pending_teams', (
      select count(*) from public.teams t join public.seasons s on s.id = t.season_id
       where t.status = 'pending' and s.status in ('signups', 'regular', 'playoffs')),
    'unreported_past_24h', (
      select count(*) from public.matches
       where status in ('scheduled', 'checkin_open', 'live', 'awaiting_reports')
         and scheduled_at < now() - interval '24 hours'),
    'matches_this_week', (
      select count(*) from public.matches
       where scheduled_at >= v_week_start and scheduled_at < v_week_start + interval '7 days'),
    'week_start', v_week_start
  );
end;
$$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- Matches with open mismatches, including ones the caller is recused from (flagged, no values).
create function public.admin_mismatch_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(q order by q ->> 'oldest')
      from (
        select jsonb_build_object(
                 'match_id', m.id,
                 'week', m.week,
                 'status', m.status,
                 'scheduled_at', m.scheduled_at,
                 'home', jsonb_build_object('id', ht.id, 'name', ht.name, 'tag', ht.tag),
                 'away', jsonb_build_object('id', at.id, 'name', at.name, 'tag', at.tag),
                 'map_fields', count(*) filter (where s.kind = 'map_score'),
                 'player_fields', count(*) filter (where s.kind = 'player_stat'),
                 'oldest', min(s.created_at),
                 'recused', not public.can_staff_match(m.id)
               ) as q
          from public.stat_mismatches s
          join public.match_maps mm on mm.id = s.match_map_id
          join public.matches m on m.id = mm.match_id
          join public.teams ht on ht.id = m.home_team_id
          join public.teams at on at.id = m.away_team_id
         where s.resolved_at is null
         group by m.id, ht.id, at.id
      ) x
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_mismatch_queue() from public, anon;
grant execute on function public.admin_mismatch_queue() to authenticated;

-- ---------------------------------------------------------------------------
-- Settling mismatches
-- ---------------------------------------------------------------------------
-- Rebuilds one map from the two reports plus resolved values. Map fields are applied once every
-- map-level mismatch on it is settled; a player's line once all of that player's are settled.
create function public.apply_map_resolutions(p_match_map_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mm public.match_maps;
  m public.matches;
  h public.report_submissions;
  a public.report_submissions;
  hm jsonb;
  am jsonb;
  base jsonb;
  v_mode uuid;
  v_map uuid;
  v_hs integer;
  v_as integer;
  r record;
  line jsonb;
  v_prev text := coalesce(current_setting('hal.no_audit', true), '');
  rv text;
begin
  select * into mm from public.match_maps where id = p_match_map_id;
  if not found then return; end if;
  select * into m from public.matches where id = mm.match_id;
  select * into h from public.report_submissions where match_id = m.id and team_id = m.home_team_id;
  select * into a from public.report_submissions where match_id = m.id and team_id = m.away_team_id;
  hm := h.maps -> (mm.map_number - 1);
  am := a.maps -> (mm.map_number - 1);
  perform set_config('hal.no_audit', 'on', true);

  -- Map fields.
  if not exists (select 1 from public.stat_mismatches where match_map_id = mm.id and kind = 'map_score' and resolved_at is null)
     and exists (select 1 from public.stat_mismatches where match_map_id = mm.id and kind = 'map_score') then
    if exists (select 1 from public.stat_mismatches where match_map_id = mm.id and kind = 'map_score'
                and field = 'played' and resolved_value = 'not reported') then
      delete from public.match_maps where id = mm.id;   -- the map wasn't played
      perform set_config('hal.no_audit', v_prev, true);
      return;
    end if;
    base := coalesce(hm, am);
    select resolved_value into rv from public.stat_mismatches where match_map_id = mm.id and field = 'mode';
    v_mode := coalesce((select id from public.game_modes where name = rv), (base ->> 'mode_id')::uuid);
    rv := null;
    select resolved_value into rv from public.stat_mismatches where match_map_id = mm.id and field = 'map';
    v_map := coalesce((select id from public.maps where name = rv), (base ->> 'map_id')::uuid);
    rv := null;
    select resolved_value into rv from public.stat_mismatches where match_map_id = mm.id and field = 'home_score';
    v_hs := coalesce(rv::integer, (base ->> 'home_score')::integer);
    rv := null;
    select resolved_value into rv from public.stat_mismatches where match_map_id = mm.id and field = 'away_score';
    v_as := coalesce(rv::integer, (base ->> 'away_score')::integer);
    if v_hs = v_as then
      raise exception 'Map % would end in a tie (% – %). Pick different scores.', mm.map_number, v_hs, v_as using errcode = 'P0001';
    end if;
    update public.match_maps
       set mode_id = v_mode, map_id = v_map, home_score = v_hs, away_score = v_as,
           winner_team_id = case when v_hs > v_as then m.home_team_id else m.away_team_id end
     where id = mm.id;
  end if;

  -- Player lines whose mismatches are all settled.
  for r in
    select s.user_id
      from public.stat_mismatches s
     where s.match_map_id = mm.id and s.kind = 'player_stat'
     group by s.user_id
    having bool_and(s.resolved_at is not null)
  loop
    select e into line from jsonb_array_elements(coalesce(h.player_stats -> (mm.map_number - 1) -> 'players', '[]')) e
     where (e ->> 'user_id')::uuid = r.user_id;
    if line is null then
      select e into line from jsonb_array_elements(coalesce(a.player_stats -> (mm.map_number - 1) -> 'players', '[]')) e
       where (e ->> 'user_id')::uuid = r.user_id;
    end if;
    if exists (select 1 from public.stat_mismatches where match_map_id = mm.id and user_id = r.user_id
                and field = 'played' and resolved_value = 'not listed') or line is null then
      delete from public.player_map_stats where match_map_id = mm.id and user_id = r.user_id;
    else
      for rv in select field || '=' || resolved_value from public.stat_mismatches
                 where match_map_id = mm.id and user_id = r.user_id and field in ('kills', 'deaths', 'score', 'team') loop
        line := jsonb_set(line, array[case split_part(rv, '=', 1) when 'team' then 'team_id' else split_part(rv, '=', 1) end],
                          case when split_part(rv, '=', 1) = 'team' then to_jsonb(split_part(rv, '=', 2))
                               else to_jsonb(split_part(rv, '=', 2)::integer) end);
      end loop;
      insert into public.player_map_stats (match_map_id, user_id, team_id, kills, deaths, score)
      values (mm.id, r.user_id, (line ->> 'team_id')::uuid, (line ->> 'kills')::integer,
              (line ->> 'deaths')::integer, (line ->> 'score')::integer)
      on conflict (match_map_id, user_id) do update
         set team_id = excluded.team_id, kills = excluded.kills, deaths = excluded.deaths, score = excluded.score;
    end if;
    line := null;
  end loop;

  update public.match_maps
     set stats_status = case
           when exists (select 1 from public.stat_mismatches where match_map_id = mm.id and kind = 'player_stat' and resolved_at is null)
             then 'mismatch'::public.stats_status else 'confirmed'::public.stats_status end
   where id = mm.id;
  perform set_config('hal.no_audit', v_prev, true);
end;
$$;
revoke execute on function public.apply_map_resolutions(uuid) from public, anon, authenticated;

-- Series from the match's maps: { home, away, valid } where valid = someone reached 3 on the last map.
create function public.series_from_maps(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.matches;
  r record;
  v_h integer := 0;
  v_a integer := 0;
  v_valid boolean := true;
begin
  select * into m from public.matches where id = p_match_id;
  for r in select winner_team_id from public.match_maps where match_id = p_match_id order by map_number loop
    if v_h = 3 or v_a = 3 or r.winner_team_id is null then
      v_valid := false;
    end if;
    if r.winner_team_id = m.home_team_id then v_h := v_h + 1;
    elsif r.winner_team_id = m.away_team_id then v_a := v_a + 1; end if;
  end loop;
  return jsonb_build_object('home', v_h, 'away', v_a, 'valid', v_valid and (v_h = 3 or v_a = 3));
end;
$$;
revoke execute on function public.series_from_maps(uuid) from public, anon, authenticated;

-- Settle one mismatched field: p_choice 'home' | 'away' | 'custom' (with p_value).
-- Settling the last one on a disputed match confirms it when the maps add up to a finished series.
create function public.resolve_mismatch(p_mismatch_id uuid, p_choice text, p_value text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.stat_mismatches;
  v_match uuid;
  v text;
  v_left integer;
  v_series jsonb;
  m public.matches;
begin
  select * into s from public.stat_mismatches where id = p_mismatch_id for update;
  if not found then
    raise exception 'That mismatch no longer exists. Reload the queue.' using errcode = 'P0002';
  end if;
  v_match := public.match_of_map(s.match_map_id);
  if not public.can_staff_match(v_match) then
    raise exception 'Recused: your team is involved in this match' using errcode = '42501';
  end if;
  if s.resolved_at is not null then
    raise exception 'Already settled' using errcode = 'P0001';
  end if;

  v := case p_choice when 'home' then s.home_value when 'away' then s.away_value when 'custom' then btrim(p_value) end;
  if v is null or v = '' then
    raise exception 'Choose a value' using errcode = 'P0001';
  end if;
  if s.field in ('kills', 'deaths', 'score', 'home_score', 'away_score') then
    if v !~ '^\d{1,6}$' then
      raise exception 'Enter a whole number' using errcode = 'P0001';
    end if;
  elsif s.field = 'mode' and not exists (select 1 from public.game_modes where name = v) then
    raise exception 'Unknown mode' using errcode = 'P0001';
  elsif s.field = 'map' and not exists (select 1 from public.maps where name = v) then
    raise exception 'Unknown map' using errcode = 'P0001';
  elsif s.field = 'played' and v not in ('played', 'not reported', 'listed', 'not listed') then
    raise exception 'Choose whether it was played' using errcode = 'P0001';
  elsif s.field = 'team' and public.try_uuid(v) is null then
    raise exception 'Choose a team' using errcode = 'P0001';
  end if;

  update public.stat_mismatches
     set resolved_value = v, resolved_by = (select auth.uid()), resolved_at = now()
   where id = s.id;
  perform public.apply_map_resolutions(s.match_map_id);

  select count(*) into v_left
    from public.stat_mismatches x join public.match_maps mm on mm.id = x.match_map_id
   where mm.match_id = v_match and x.resolved_at is null;

  select * into m from public.matches where id = v_match;
  if v_left = 0 and m.status = 'disputed'
     and not exists (select 1 from public.disputes where match_id = v_match and status = 'open') then
    v_series := public.series_from_maps(v_match);
    if (v_series ->> 'valid')::boolean then
      update public.matches
         set status = 'confirmed',
             home_series = (v_series ->> 'home')::integer,
             away_series = (v_series ->> 'away')::integer,
             winner_team_id = case when (v_series ->> 'home')::integer > (v_series ->> 'away')::integer then m.home_team_id else m.away_team_id end,
             confirmed_at = now(),
             result_source = 'admin'
       where id = v_match;
    end if;
  end if;

  select * into m from public.matches where id = v_match;
  return jsonb_build_object('remaining', v_left, 'status', m.status, 'series', public.series_from_maps(v_match));
end;
$$;
revoke execute on function public.resolve_mismatch(uuid, text, text) from public, anon;
grant execute on function public.resolve_mismatch(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Results: overturn, clear, forfeit
-- ---------------------------------------------------------------------------
-- Sets the maps and series directly (disputes, corrections). p_maps: [{ mode_id, map_id,
-- home_score, away_score }] in order. Player stats on maps that still exist are kept.
create function public.admin_set_result(p_match_id uuid, p_maps jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  v_n integer := coalesce(jsonb_array_length(p_maps), 0);
  v_map jsonb;
  i integer;
  v_hs integer;
  v_as integer;
  v_h integer := 0;
  v_a integer := 0;
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if not public.can_staff_match(p_match_id) then
    raise exception 'Recused: your team is involved in this match' using errcode = '42501';
  end if;
  if v_n < 3 or v_n > 5 then
    raise exception 'A series is 3 to 5 maps' using errcode = 'P0001';
  end if;

  for i in 1 .. v_n loop
    v_map := p_maps -> (i - 1);
    if v_h = 3 or v_a = 3 then
      raise exception 'Map % was played after the series was decided', i using errcode = 'P0001';
    end if;
    v_hs := public.report_int(v_map, 'home_score', format('Map %s home score', i), 100000);
    v_as := public.report_int(v_map, 'away_score', format('Map %s away score', i), 100000);
    if v_hs = v_as then
      raise exception 'Map % can''t end in a tie', i using errcode = 'P0001';
    end if;
    if public.try_uuid(v_map ->> 'mode_id') is null or public.try_uuid(v_map ->> 'map_id') is null then
      raise exception 'Map %: choose a mode and map', i using errcode = 'P0001';
    end if;
    if v_hs > v_as then v_h := v_h + 1; else v_a := v_a + 1; end if;

    insert into public.match_maps (match_id, map_number, mode_id, map_id, home_score, away_score, winner_team_id, stats_status)
    values (p_match_id, i, (v_map ->> 'mode_id')::uuid, (v_map ->> 'map_id')::uuid, v_hs, v_as,
            case when v_hs > v_as then m.home_team_id else m.away_team_id end, 'confirmed')
    on conflict (match_id, map_number) do update
       set mode_id = excluded.mode_id, map_id = excluded.map_id, home_score = excluded.home_score,
           away_score = excluded.away_score, winner_team_id = excluded.winner_team_id;
  end loop;
  if v_h < 3 and v_a < 3 then
    raise exception 'The series isn''t finished: one team needs 3 map wins' using errcode = 'P0001';
  end if;
  delete from public.match_maps where match_id = p_match_id and map_number > v_n;

  -- Map-level mismatches are superseded by this result.
  update public.stat_mismatches s
     set resolved_value = 'set by admin result', resolved_by = (select auth.uid()), resolved_at = now()
    from public.match_maps mm
   where mm.id = s.match_map_id and mm.match_id = p_match_id and s.kind = 'map_score' and s.resolved_at is null;

  update public.matches
     set status = 'confirmed', home_series = v_h, away_series = v_a,
         winner_team_id = case when v_h > v_a then m.home_team_id else m.away_team_id end,
         forfeit_team_id = null, confirmed_at = now(), result_source = 'admin'
   where id = p_match_id;
end;
$$;
revoke execute on function public.admin_set_result(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_result(uuid, jsonb) to authenticated;

-- Wipes the result, maps, stats and both reports so the match can be played or reported again.
create function public.admin_clear_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if not public.can_staff_match(p_match_id) then
    raise exception 'Recused: your team is involved in this match' using errcode = '42501';
  end if;
  if m.forfeit_team_id is not null then
    update public.teams set forfeit_count = greatest(forfeit_count - 1, 0) where id = m.forfeit_team_id;
  end if;
  update public.matches
     set status = case when scheduled_at > now() then 'scheduled'::public.match_status else 'awaiting_reports'::public.match_status end,
         home_series = null, away_series = null, winner_team_id = null, forfeit_team_id = null,
         confirmed_at = null, result_source = null
   where id = p_match_id;
  delete from public.match_maps where match_id = p_match_id;
  delete from public.report_submissions where match_id = p_match_id;
end;
$$;
revoke execute on function public.admin_clear_result(uuid) from public, anon;
grant execute on function public.admin_clear_result(uuid) to authenticated;

-- Records a forfeit: the other team wins (counted 3–0 in standings).
create function public.admin_forfeit(p_match_id uuid, p_forfeit_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if not public.can_staff_match(p_match_id) then
    raise exception 'Recused: your team is involved in this match' using errcode = '42501';
  end if;
  if p_forfeit_team_id not in (m.home_team_id, m.away_team_id) then
    raise exception 'Choose one of the two teams' using errcode = 'P0001';
  end if;
  if m.forfeit_team_id is distinct from p_forfeit_team_id then
    if m.forfeit_team_id is not null then
      update public.teams set forfeit_count = greatest(forfeit_count - 1, 0) where id = m.forfeit_team_id;
    end if;
    update public.teams set forfeit_count = forfeit_count + 1 where id = p_forfeit_team_id;
  end if;
  update public.matches
     set status = 'forfeit', forfeit_team_id = p_forfeit_team_id,
         winner_team_id = case when p_forfeit_team_id = m.home_team_id then m.away_team_id else m.home_team_id end,
         home_series = null, away_series = null, confirmed_at = now(), result_source = 'forfeit'
   where id = p_match_id;
end;
$$;
revoke execute on function public.admin_forfeit(uuid, uuid) from public, anon;
grant execute on function public.admin_forfeit(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Bans (with a public penalty record)
-- ---------------------------------------------------------------------------
create function public.ban_player(p_user_id uuid, p_until timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'Staff cannot ban themselves' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason (it is shown in the audit log)' using errcode = 'P0001';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'The ban must end in the future' using errcode = 'P0001';
  end if;
  -- Recused from players on the caller's own team.
  select tm.team_id into v_team from public.team_members tm
   where tm.user_id = p_user_id and tm.left_at is null and not tm.is_emergency limit 1;
  if v_team is not null and not public.can_staff_team(v_team) then
    raise exception 'Recused: this player is on your team' using errcode = '42501';
  end if;

  update public.profiles set banned_until = p_until where id = p_user_id;
  insert into public.penalties (user_id, team_id, type, note)
  values (p_user_id, null, case when p_until is null then 'other'::public.penalty_type else 'ban'::public.penalty_type end,
          case when p_until is null then 'Ban lifted: ' else format('Banned until %s: ', to_char(p_until at time zone 'America/New_York', 'Mon DD, YYYY')) end
          || btrim(p_reason));
end;
$$;
revoke execute on function public.ban_player(uuid, timestamptz, text) from public, anon;
grant execute on function public.ban_player(uuid, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Staff roles: the last owner can't be removed
-- ---------------------------------------------------------------------------
create function public.staff_roles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and (select count(*) from public.staff_roles where role = 'owner') <= 1 then
    raise exception 'The league needs at least one owner' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
revoke execute on function public.staff_roles_guard() from public, anon, authenticated;

create trigger staff_roles_guard before delete on public.staff_roles
  for each row execute function public.staff_roles_guard();
