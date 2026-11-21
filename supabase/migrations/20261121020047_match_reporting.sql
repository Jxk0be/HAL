-- Step 14: double-entry match reporting.
--
-- Captains report through submit_report() only (direct writes to report_submissions are staff-only).
-- Every insert/update/delete of a report re-runs compare_reports(), which rebuilds match_maps,
-- player_map_stats and stat_mismatches from the two reports and sets the match status. The
-- comparison is idempotent: running it again gives the same rows.
--
-- Captains never see the opponent's report (or its screenshots) until the match is settled;
-- they see which fields mismatched through my_match_report_status().
--
-- 24-hour rule: auto_confirm_reports() (pg_cron, every 15 min) accepts a lone report with
-- screenshots for every map once the match is 24h past its scheduled time.

create extension if not exists pg_cron with schema pg_catalog;

create type public.result_source as enum ('double_entry', 'single_report', 'admin', 'forfeit');
alter table public.matches add column result_source public.result_source;

-- ---------------------------------------------------------------------------
-- Audit: skip the derived rows the comparison writes (hal.no_audit). The 24-hour rule writes
-- one explicit summary entry instead of a row per stat line.
-- ---------------------------------------------------------------------------
create or replace function public.audit_staff_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_keys text[];
begin
  if coalesce(current_setting('hal.no_audit', true), '') = 'on' then
    return null;
  end if;

  if v_uid is null then
    v_role := 'system';            -- service role: the bot, Edge Functions, the SQL editor
  else
    select r.role::text into v_role
      from public.staff_roles r
     where r.user_id = v_uid
     order by case r.role when 'owner' then 1 when 'admin' then 2 else 3 end
     limit 1;
    if v_role is null then
      return null;                 -- captains and players are not audit-logged
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old := public.audit_strip(to_jsonb(old));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := public.audit_strip(to_jsonb(new));
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_keys
      from jsonb_object_keys(v_new) k
     where k <> 'updated_at' and (v_old -> k) is distinct from (v_new -> k);
    if v_keys is null then
      return null;                 -- nothing visible changed
    end if;
    select jsonb_object_agg(k, v_old -> k), jsonb_object_agg(k, v_new -> k)
      into v_old, v_new
      from unnest(v_keys) k;
  end if;

  v_row := coalesce(to_jsonb(new), to_jsonb(old));
  insert into public.audit_log (actor_id, actor_role, action, table_name, row_id, old_data, new_data)
  values (
    v_uid,
    v_role,
    lower(tg_op),
    tg_table_name,
    coalesce(
      v_row ->> 'id',
      v_row ->> 'key',
      case when v_row ? 'role' and v_row ? 'user_id' then (v_row ->> 'user_id') || ':' || (v_row ->> 'role') end,
      case when v_row ? 'map_id' and v_row ? 'mode_id' then (v_row ->> 'map_id') || ':' || (v_row ->> 'mode_id') end
    ),
    v_old,
    v_new
  );
  return null;
end;
$$;
revoke execute on function public.audit_staff_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.match_settled(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches m
     where m.id = p_match_id and m.status in ('confirmed', 'forfeit', 'cancelled')
  );
$$;
revoke execute on function public.match_settled(uuid) from public, anon;
grant execute on function public.match_settled(uuid) to authenticated, service_role;

-- A whole, non-negative number from a report field, or a readable error.
create function public.report_int(p jsonb, p_key text, p_label text, p_max integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := p -> p_key;
  n numeric;
begin
  if v is null or jsonb_typeof(v) <> 'number' then
    raise exception '% is missing', p_label using errcode = 'P0001';
  end if;
  n := v::text::numeric;
  if n <> trunc(n) or n < 0 or n > p_max then
    raise exception '% must be a whole number from 0 to %', p_label, p_max using errcode = 'P0001';
  end if;
  return n::integer;
end;
$$;
revoke execute on function public.report_int(jsonb, text, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Comparison
-- ---------------------------------------------------------------------------
-- Rebuilds the match's maps, confirmed stats and mismatches from two reports (pass the same
-- report twice to accept it alone). With fewer than two reports it clears derived rows and
-- leaves the match awaiting reports.
create function public.apply_reports(
  p_match_id uuid,
  p_home public.report_submissions,
  p_away public.report_submissions,
  p_source public.result_source
)
returns public.match_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  v_prev_internal text := coalesce(current_setting('hal.internal', true), '');
  v_prev_audit text := coalesce(current_setting('hal.no_audit', true), '');
  v_n integer;
  i integer;
  hm jsonb;
  am jsonb;
  v_mm uuid;
  v_equal boolean;
  v_map_bad boolean := false;
  v_stat_bad boolean;
  r record;
  f text;
  v_home integer;
  v_away integer;
  v_status public.match_status;
begin
  select * into m from public.matches where id = p_match_id;
  perform set_config('hal.internal', 'on', true);
  perform set_config('hal.no_audit', 'on', true);

  delete from public.match_maps where match_id = p_match_id;  -- cascades stats and mismatches

  if p_home.id is null or p_away.id is null then
    update public.matches
       set status = 'awaiting_reports', home_series = null, away_series = null,
           winner_team_id = null, confirmed_at = null, result_source = null
     where id = p_match_id;
    v_status := 'awaiting_reports';
  else
    v_n := greatest(jsonb_array_length(p_home.maps), jsonb_array_length(p_away.maps));
    for i in 1 .. v_n loop
      hm := p_home.maps -> (i - 1);
      am := p_away.maps -> (i - 1);
      v_equal := hm is not null and am is not null
             and hm -> 'home_score' = am -> 'home_score'
             and hm -> 'away_score' = am -> 'away_score';

      insert into public.match_maps (match_id, map_number, mode_id, map_id, home_score, away_score, winner_team_id)
      values (
        p_match_id, i,
        coalesce(hm ->> 'mode_id', am ->> 'mode_id')::uuid,
        coalesce(hm ->> 'map_id', am ->> 'map_id')::uuid,
        case when v_equal then (hm ->> 'home_score')::integer end,
        case when v_equal then (hm ->> 'away_score')::integer end,
        case when v_equal then
          case when (hm ->> 'home_score')::integer > (hm ->> 'away_score')::integer then m.home_team_id else m.away_team_id end
        end
      )
      returning id into v_mm;

      -- Map-level differences.
      if hm is null or am is null then
        insert into public.stat_mismatches (match_map_id, kind, field, home_value, away_value)
        values (v_mm, 'map_score', 'played',
                case when hm is null then 'not reported' else 'played' end,
                case when am is null then 'not reported' else 'played' end);
        v_map_bad := true;
      else
        if hm ->> 'mode_id' <> am ->> 'mode_id' then
          insert into public.stat_mismatches (match_map_id, kind, field, home_value, away_value)
          values (v_mm, 'map_score', 'mode',
                  (select name from public.game_modes where id = (hm ->> 'mode_id')::uuid),
                  (select name from public.game_modes where id = (am ->> 'mode_id')::uuid));
          v_map_bad := true;
        end if;
        if hm ->> 'map_id' <> am ->> 'map_id' then
          insert into public.stat_mismatches (match_map_id, kind, field, home_value, away_value)
          values (v_mm, 'map_score', 'map',
                  (select name from public.maps where id = (hm ->> 'map_id')::uuid),
                  (select name from public.maps where id = (am ->> 'map_id')::uuid));
          v_map_bad := true;
        end if;
        foreach f in array array['home_score', 'away_score'] loop
          if hm -> f <> am -> f then
            insert into public.stat_mismatches (match_map_id, kind, field, home_value, away_value)
            values (v_mm, 'map_score', f, hm ->> f, am ->> f);
            v_map_bad := true;
          end if;
        end loop;
      end if;

      -- Player stats: equal lines are confirmed; every differing field is a mismatch.
      v_stat_bad := false;
      for r in
        select coalesce(h.u, a.u) as user_id, h.p as hp, a.p as ap
          from (select (e ->> 'user_id')::uuid as u, e as p
                  from jsonb_array_elements(coalesce(p_home.player_stats -> (i - 1) -> 'players', '[]'::jsonb)) e) h
          full join (select (e ->> 'user_id')::uuid as u, e as p
                       from jsonb_array_elements(coalesce(p_away.player_stats -> (i - 1) -> 'players', '[]'::jsonb)) e) a
            on a.u = h.u
      loop
        if r.hp is null or r.ap is null then
          insert into public.stat_mismatches (match_map_id, kind, user_id, field, home_value, away_value)
          values (v_mm, 'player_stat', r.user_id, 'played',
                  case when r.hp is null then 'not listed' else 'listed' end,
                  case when r.ap is null then 'not listed' else 'listed' end);
          v_stat_bad := true;
        elsif r.hp -> 'kills' = r.ap -> 'kills' and r.hp -> 'deaths' = r.ap -> 'deaths'
              and r.hp -> 'score' = r.ap -> 'score' and r.hp ->> 'team_id' = r.ap ->> 'team_id' then
          insert into public.player_map_stats (match_map_id, user_id, team_id, kills, deaths, score)
          values (v_mm, r.user_id, (r.hp ->> 'team_id')::uuid,
                  (r.hp ->> 'kills')::integer, (r.hp ->> 'deaths')::integer, (r.hp ->> 'score')::integer);
        else
          foreach f in array array['team_id', 'kills', 'deaths', 'score'] loop
            if r.hp -> f <> r.ap -> f then
              insert into public.stat_mismatches (match_map_id, kind, user_id, field, home_value, away_value)
              values (v_mm, 'player_stat', r.user_id, case f when 'team_id' then 'team' else f end, r.hp ->> f, r.ap ->> f);
            end if;
          end loop;
          v_stat_bad := true;
        end if;
      end loop;

      update public.match_maps
         set stats_status = case when v_stat_bad then 'mismatch'::public.stats_status else 'confirmed'::public.stats_status end
       where id = v_mm;
    end loop;

    if v_map_bad then
      update public.matches
         set status = 'disputed', home_series = null, away_series = null,
             winner_team_id = null, confirmed_at = null, result_source = null
       where id = p_match_id;
      v_status := 'disputed';
    else
      select count(*) filter (where winner_team_id = m.home_team_id), count(*) filter (where winner_team_id = m.away_team_id)
        into v_home, v_away
        from public.match_maps where match_id = p_match_id;
      update public.matches
         set status = 'confirmed', home_series = v_home, away_series = v_away,
             winner_team_id = case when v_home > v_away then m.home_team_id else m.away_team_id end,
             confirmed_at = now(), result_source = p_source
       where id = p_match_id;
      v_status := 'confirmed';
    end if;
  end if;

  perform set_config('hal.internal', v_prev_internal, true);
  perform set_config('hal.no_audit', v_prev_audit, true);
  return v_status;
end;
$$;
revoke execute on function public.apply_reports(uuid, public.report_submissions, public.report_submissions, public.result_source)
  from public, anon, authenticated;

-- Compares the two teams' reports for a match. Settled matches are left alone.
create function public.compare_reports(p_match_id uuid)
returns public.match_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  h public.report_submissions;
  a public.report_submissions;
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    return null;
  end if;
  if m.status in ('confirmed', 'forfeit', 'cancelled') then
    return m.status;
  end if;
  select * into h from public.report_submissions where match_id = p_match_id and team_id = m.home_team_id;
  select * into a from public.report_submissions where match_id = p_match_id and team_id = m.away_team_id;
  return public.apply_reports(p_match_id, h, a, 'double_entry');
end;
$$;
revoke execute on function public.compare_reports(uuid) from public, anon, authenticated;

create function public.report_submissions_compare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.compare_reports(coalesce(new.match_id, old.match_id));
  return null;
end;
$$;
revoke execute on function public.report_submissions_compare() from public, anon, authenticated;

create trigger report_submissions_compare after insert or update or delete on public.report_submissions
  for each row execute function public.report_submissions_compare();

-- ---------------------------------------------------------------------------
-- Submitting
-- ---------------------------------------------------------------------------
-- p_report: { maps: [{ number, mode_id, map_id, home_score, away_score,
--                      screenshots: [path], players: [{ user_id, team_id, kills, deaths, score }] }] }
-- Screenshots must already be uploaded to screenshots/matches/{match}/{team}/map{n}-*.
create function public.submit_report(p_match_id uuid, p_report jsonb, p_source public.submission_source default 'site')
returns public.match_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  m public.matches;
  v_team uuid;
  v_maps jsonb := coalesce(p_report -> 'maps', 'null'::jsonb);
  v_n integer;
  v_map jsonb;
  v_i integer;
  v_hs integer;
  v_as integer;
  v_home_wins integer := 0;
  v_away_wins integer := 0;
  v_out_maps jsonb := '[]'::jsonb;
  v_out_stats jsonb := '[]'::jsonb;
  v_paths text[] := '{}';
  v_map_paths text[];
  v_players jsonb;
  v_p jsonb;
  v_out_players jsonb;
  v_prefix text;
  v_path text;
  v_status public.match_status;
begin
  if v_uid is null then
    raise exception 'Sign in to report a match' using errcode = '42501';
  end if;

  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'P0001';
  end if;
  v_team := public.match_captain_team(p_match_id);
  if v_team is null then
    raise exception 'Only a captain or co-captain of either team can report this match' using errcode = '42501';
  end if;
  if m.status in ('confirmed', 'forfeit', 'cancelled') then
    raise exception 'This match is already settled; open a dispute instead' using errcode = 'P0001';
  end if;
  if m.scheduled_at > now() then
    raise exception 'Reporting opens at the scheduled match time' using errcode = 'P0001';
  end if;

  if jsonb_typeof(v_maps) <> 'array' then
    raise exception 'The report has no maps' using errcode = 'P0001';
  end if;
  v_n := jsonb_array_length(v_maps);
  if v_n < 3 or v_n > 5 then
    raise exception 'A series is 3 to 5 maps' using errcode = 'P0001';
  end if;

  for v_i in 1 .. v_n loop
    v_map := v_maps -> (v_i - 1);

    -- Series maths: first to 3, nothing after it is decided, no ties.
    if v_home_wins = 3 or v_away_wins = 3 then
      raise exception 'Map % was played after the series was decided', v_i using errcode = 'P0001';
    end if;
    v_hs := public.report_int(v_map, 'home_score', format('Map %s home score', v_i), 100000);
    v_as := public.report_int(v_map, 'away_score', format('Map %s away score', v_i), 100000);
    if v_hs = v_as then
      raise exception 'Map % can''t end in a tie', v_i using errcode = 'P0001';
    end if;
    if v_hs > v_as then v_home_wins := v_home_wins + 1; else v_away_wins := v_away_wins + 1; end if;

    -- Mode and a map that is legal in it.
    if public.try_uuid(v_map ->> 'mode_id') is null
       or not exists (select 1 from public.game_modes where id = public.try_uuid(v_map ->> 'mode_id')) then
      raise exception 'Map %: choose a mode', v_i using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.map_modes
       where map_id = public.try_uuid(v_map ->> 'map_id') and mode_id = (v_map ->> 'mode_id')::uuid
    ) then
      raise exception 'Map %: that map isn''t played in that mode', v_i using errcode = 'P0001';
    end if;

    -- Screenshots (required, uploaded to this team's folder).
    v_prefix := format('matches/%s/%s/map%s-', p_match_id, v_team, v_i);
    select coalesce(array_agg(x), '{}') into v_map_paths
      from jsonb_array_elements_text(coalesce(v_map -> 'screenshots', '[]'::jsonb)) x;
    if cardinality(v_map_paths) = 0 then
      raise exception 'Map %: add at least one scoreboard screenshot', v_i using errcode = 'P0001';
    end if;
    if cardinality(v_map_paths) > 6 then
      raise exception 'Map %: at most 6 screenshots', v_i using errcode = 'P0001';
    end if;
    foreach v_path in array v_map_paths loop
      if left(v_path, length(v_prefix)) <> v_prefix
         or not exists (select 1 from storage.objects o where o.bucket_id = 'screenshots' and o.name = v_path) then
        raise exception 'Map %: a screenshot didn''t upload, add it again', v_i using errcode = 'P0001';
      end if;
    end loop;
    v_paths := v_paths || v_map_paths;

    -- Player lines: 4 per team, each on that team's roster for this match.
    v_players := coalesce(v_map -> 'players', '[]'::jsonb);
    if jsonb_typeof(v_players) <> 'array' then
      raise exception 'Map %: player stats are missing', v_i using errcode = 'P0001';
    end if;
    v_out_players := '[]'::jsonb;
    for v_p in select e from jsonb_array_elements(v_players) e loop
      if public.try_uuid(v_p ->> 'user_id') is null
         or public.try_uuid(v_p ->> 'team_id') not in (m.home_team_id, m.away_team_id)
         or public.try_uuid(v_p ->> 'team_id') is null then
        raise exception 'Map %: choose a player for every row', v_i using errcode = 'P0001';
      end if;
      if not exists (
        select 1 from public.team_members tm
         where tm.user_id = (v_p ->> 'user_id')::uuid
           and tm.team_id = (v_p ->> 'team_id')::uuid
           and (tm.left_at is null or tm.left_at > m.scheduled_at)
           and (not tm.is_emergency or tm.emergency_match_id = m.id)
      ) then
        raise exception 'Map %: a player isn''t on that team''s roster', v_i using errcode = 'P0001';
      end if;
      v_out_players := v_out_players || jsonb_build_object(
        'user_id', v_p ->> 'user_id',
        'team_id', v_p ->> 'team_id',
        'kills', public.report_int(v_p, 'kills', format('Map %s kills', v_i), 500),
        'deaths', public.report_int(v_p, 'deaths', format('Map %s deaths', v_i), 500),
        'score', public.report_int(v_p, 'score', format('Map %s score', v_i), 100000)
      );
    end loop;
    if (select count(*) from jsonb_array_elements(v_out_players) e where (e ->> 'team_id')::uuid = m.home_team_id) <> 4
       or (select count(*) from jsonb_array_elements(v_out_players) e where (e ->> 'team_id')::uuid = m.away_team_id) <> 4 then
      raise exception 'Map %: enter 4 players for each team', v_i using errcode = 'P0001';
    end if;
    if (select count(distinct e ->> 'user_id') from jsonb_array_elements(v_out_players) e) <> 8 then
      raise exception 'Map %: a player is listed twice', v_i using errcode = 'P0001';
    end if;

    v_out_maps := v_out_maps || jsonb_build_object(
      'number', v_i, 'mode_id', v_map ->> 'mode_id', 'map_id', v_map ->> 'map_id',
      'home_score', v_hs, 'away_score', v_as
    );
    v_out_stats := v_out_stats || jsonb_build_object('number', v_i, 'players', v_out_players);
  end loop;

  if v_home_wins < 3 and v_away_wins < 3 then
    raise exception 'The series isn''t finished: one team needs 3 map wins' using errcode = 'P0001';
  end if;

  insert into public.report_submissions (match_id, team_id, submitted_by, home_series, away_series, maps, player_stats, screenshot_paths, source)
  values (p_match_id, v_team, v_uid, v_home_wins, v_away_wins, v_out_maps, v_out_stats, v_paths, p_source)
  on conflict (match_id, team_id) do update
     set submitted_by = excluded.submitted_by,
         submitted_at = now(),
         home_series = excluded.home_series,
         away_series = excluded.away_series,
         maps = excluded.maps,
         player_stats = excluded.player_stats,
         screenshot_paths = excluded.screenshot_paths,
         source = excluded.source;

  select status into v_status from public.matches where id = p_match_id;
  return v_status;
end;
$$;
revoke execute on function public.submit_report(uuid, jsonb, public.submission_source) from public, anon;
grant execute on function public.submit_report(uuid, jsonb, public.submission_source) to authenticated, service_role;

-- What a party to the match may see: whether each side has reported and which fields
-- mismatched (never the opponent's values).
create function public.my_match_report_status(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  select * into m from public.matches where id = p_match_id;
  if not found or not (public.is_party_to_match(p_match_id) or public.is_admin()) then
    return null;
  end if;
  return jsonb_build_object(
    'status', m.status,
    'result_source', m.result_source,
    'home_reported_at', (select submitted_at from public.report_submissions where match_id = m.id and team_id = m.home_team_id),
    'away_reported_at', (select submitted_at from public.report_submissions where match_id = m.id and team_id = m.away_team_id),
    'mismatches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'map_number', mm.map_number,
               'kind', s.kind,
               'field', s.field,
               'user_id', s.user_id,
               'player', coalesce(p.discord_username, p.activision_id),
               'resolved', s.resolved_at is not null
             ) order by mm.map_number, s.kind, p.discord_username, s.field)
        from public.stat_mismatches s
        join public.match_maps mm on mm.id = s.match_map_id
        left join public.profiles p on p.id = s.user_id
       where mm.match_id = m.id
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.my_match_report_status(uuid) from public, anon;
grant execute on function public.my_match_report_status(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 24-hour rule
-- ---------------------------------------------------------------------------
create function public.auto_confirm_reports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  r public.report_submissions;
  v_count integer := 0;
  v_status public.match_status;
begin
  for m in
    select * from public.matches
     where status in ('scheduled', 'checkin_open', 'live', 'awaiting_reports')
       and scheduled_at < now() - interval '24 hours'
       and (select count(*) from public.report_submissions s where s.match_id = matches.id) = 1
     for update skip locked
  loop
    select * into r from public.report_submissions where match_id = m.id;
    -- Every map needs at least one screenshot.
    if exists (
      select 1 from generate_series(1, jsonb_array_length(r.maps)) n
       where not exists (
         select 1 from unnest(r.screenshot_paths) p
          where p like format('matches/%s/%s/map%s-%%', m.id, r.team_id, n)
       )
    ) then
      continue;
    end if;

    v_status := public.apply_reports(m.id, r, r, 'single_report');
    insert into public.audit_log (actor_id, actor_role, action, table_name, row_id, old_data, new_data)
    select null, 'system', 'update', 'matches', m.id::text,
           jsonb_build_object('status', m.status),
           jsonb_build_object('status', x.status, 'result_source', x.result_source,
                              'home_series', x.home_series, 'away_series', x.away_series,
                              'reason', '24-hour rule: only one team reported')
      from public.matches x where x.id = m.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.auto_confirm_reports() from public, anon, authenticated;

select cron.schedule('hal-auto-confirm-reports', '*/15 * * * *', 'select public.auto_confirm_reports()');

-- ---------------------------------------------------------------------------
-- Policies: reports through submit_report() only; no peeking at the opponent's report.
-- ---------------------------------------------------------------------------
drop policy "captains submit their team's report" on public.report_submissions;
drop policy "captains update their team's report; staff any (recused)" on public.report_submissions;
drop policy "parties and staff read reports" on public.report_submissions;

create policy "own team, staff, or both teams once settled read reports" on public.report_submissions
  for select to authenticated
  using (
    (select public.can_staff_match(match_id))
    or (select public.is_on_team(team_id))
    or ((select public.match_settled(match_id)) and (select public.is_party_to_match(match_id)))
  );
create policy "staff update reports (recused)" on public.report_submissions
  for update to authenticated
  using ((select public.can_staff_match(match_id)))
  with check ((select public.can_staff_match(match_id)));

drop policy "parties and staff read mismatches" on public.stat_mismatches;
create policy "staff read mismatches (recused)" on public.stat_mismatches
  for select to authenticated
  using ((select public.can_staff_match(public.match_of_map(match_map_id))));

-- Screenshots of match reports: own team and staff; both teams once the match is settled.
drop policy "screenshots: parties and staff read" on storage.objects;
create policy "screenshots: parties and staff read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'screenshots'
    and (
      (select public.is_admin())
      or (
        (storage.foldername(name))[1] = 'disputes'
        and public.is_party_to_match(public.try_uuid((storage.foldername(name))[2]))
      )
      or (
        (storage.foldername(name))[1] = 'matches'
        and (
          public.is_on_team(public.try_uuid((storage.foldername(name))[3]))
          or (
            public.match_settled(public.try_uuid((storage.foldername(name))[2]))
            and public.is_party_to_match(public.try_uuid((storage.foldername(name))[2]))
          )
        )
      )
    )
  );
