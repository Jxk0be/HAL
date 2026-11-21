-- Double-entry reporting tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).

-- Builds a report: scores is [home1, away1, home2, away2, ...]; optionally bumps one player's kills on one map.
create or replace function pg_temp.rep(
  p_match uuid, p_folder_team uuid, p_home uuid, p_away uuid, p_hp uuid[], p_ap uuid[],
  p_scores int[], p_mode uuid, p_map uuid, p_bump_map int default 0, p_bump_user uuid default null
) returns jsonb language plpgsql as $$
declare
  v_maps jsonb := '[]';
  v_players jsonb;
  n int;
  i int;
begin
  for n in 1 .. array_length(p_scores, 1) / 2 loop
    v_players := '[]';
    for i in 1 .. 4 loop
      v_players := v_players
        || jsonb_build_object('user_id', p_hp[i], 'team_id', p_home,
             'kills', 10 + i + n + case when n = p_bump_map and p_hp[i] = p_bump_user then 1 else 0 end,
             'deaths', 8 + i, 'score', 1000 * i)
        || jsonb_build_object('user_id', p_ap[i], 'team_id', p_away,
             'kills', 9 + i + n + case when n = p_bump_map and p_ap[i] = p_bump_user then 1 else 0 end,
             'deaths', 7 + i, 'score', 900 * i);
    end loop;
    v_maps := v_maps || jsonb_build_object(
      'number', n, 'mode_id', p_mode, 'map_id', p_map,
      'home_score', p_scores[2 * n - 1], 'away_score', p_scores[2 * n],
      'screenshots', jsonb_build_array(format('matches/%s/%s/map%s-1.webp', p_match, p_folder_team, n)),
      'players', v_players);
  end loop;
  return jsonb_build_object('maps', v_maps);
end;
$$;

do $test$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  ha uuid[];
  hb uuid[];
  v_season uuid;
  v_a uuid; v_b uuid;
  v_mode uuid; v_map uuid; v_bad_map uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid; v_m4 uuid; v_future uuid;
  x uuid;
  t uuid;
  v_status text;
  v_json jsonb;
  v_n int;
  v_checks int := 0;
  r_a1 jsonb; r_b1 jsonb; r_b2 jsonb; r_a2 jsonb; r_b3 jsonb; r_a3 jsonb; r_a3fix jsonb; r_a4 jsonb;
begin
  foreach x in array u loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'rp' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'rp' || left(id::text, 6) || '#1234567' where id = any (u);
  ha := u[1:4];
  hb := u[5:8];

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('Report ' || gen_random_uuid(), 'regular') returning id into v_season;
  end if;
  update public.seasons set status = 'regular' where id = v_season;

  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Alpha ' || left(gen_random_uuid()::text, 4), 'RPA', u[1], 'approved') returning id into v_a;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Bravo ' || left(gen_random_uuid()::text, 4), 'RPB', u[5], 'approved') returning id into v_b;
  insert into public.team_members (team_id, user_id) values (v_a, u[2]), (v_a, u[3]), (v_a, u[4]), (v_b, u[6]), (v_b, u[7]), (v_b, u[8]);

  insert into public.game_modes (name) values ('HP ' || gen_random_uuid()) returning id into v_mode;
  insert into public.maps (name) values ('Map ' || gen_random_uuid()) returning id into v_map;
  insert into public.maps (name) values ('Other ' || gen_random_uuid()) returning id into v_bad_map;
  insert into public.map_modes (map_id, mode_id) values (v_map, v_mode);

  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_a, v_b, now() - interval '1 hour', now() - interval '1 hour') returning id into v_m1;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 2, v_a, v_b, now() - interval '1 hour', now() - interval '1 hour') returning id into v_m2;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 3, v_a, v_b, now() - interval '1 hour', now() - interval '1 hour') returning id into v_m3;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 4, v_a, v_b, now() - interval '25 hours', now() - interval '25 hours') returning id into v_m4;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 5, v_a, v_b, now() + interval '1 day', now() + interval '1 day') returning id into v_future;

  -- Uploaded screenshots for every match/team/map.
  foreach x in array array[v_m1, v_m2, v_m3, v_m4, v_future] loop
    foreach t in array array[v_a, v_b] loop
      insert into storage.objects (bucket_id, name, owner_id)
      select 'screenshots', format('matches/%s/%s/map%s-1.webp', x, t, n), u[1]::text from generate_series(1, 5) n;
    end loop;
  end loop;

  r_a1 := pg_temp.rep(v_m1, v_a, v_a, v_b, ha, hb, array[250, 200, 6, 3, 250, 100], v_mode, v_map);
  r_b1 := pg_temp.rep(v_m1, v_b, v_a, v_b, ha, hb, array[250, 200, 6, 3, 250, 100], v_mode, v_map);
  r_a2 := pg_temp.rep(v_m2, v_a, v_a, v_b, ha, hb, array[250, 200, 3, 6, 250, 100, 5, 6, 250, 249], v_mode, v_map);
  r_b2 := pg_temp.rep(v_m2, v_b, v_a, v_b, ha, hb, array[250, 200, 3, 6, 250, 100, 5, 6, 250, 249], v_mode, v_map, 2, u[6]);
  r_a3 := pg_temp.rep(v_m3, v_a, v_a, v_b, ha, hb, array[250, 200, 6, 3, 250, 100], v_mode, v_map);
  r_b3 := pg_temp.rep(v_m3, v_b, v_a, v_b, ha, hb, array[250, 210, 6, 3, 250, 100], v_mode, v_map);
  r_a3fix := pg_temp.rep(v_m3, v_a, v_a, v_b, ha, hb, array[250, 210, 6, 3, 250, 100], v_mode, v_map);
  r_a4 := pg_temp.rep(v_m4, v_a, v_a, v_b, ha, hb, array[100, 250, 100, 250, 100, 250], v_mode, v_map);

  -- ---- Captain A ----------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Validation.
  begin
    perform public.submit_report(v_m1, pg_temp.rep(v_m1, v_a, v_a, v_b, ha, hb, array[250, 200, 6, 3, 100, 250], v_mode, v_map));
    raise exception 'FAIL: unfinished series accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%isn''t finished%' then raise; end if;
  end;
  begin
    perform public.submit_report(v_m1, pg_temp.rep(v_m1, v_a, v_a, v_b, ha, hb, array[250, 200, 6, 3, 250, 100, 250, 1], v_mode, v_map));
    raise exception 'FAIL: map after decided series accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%after the series was decided%' then raise; end if;
  end;
  begin
    perform public.submit_report(v_m1, pg_temp.rep(v_m1, v_a, v_a, v_b, ha, hb, array[250, 200, 6, 3, 250, 100], v_mode, v_bad_map));
    raise exception 'FAIL: illegal map accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%isn''t played in that mode%' then raise; end if;
  end;
  begin
    perform public.submit_report(v_m1, pg_temp.rep(v_m1, v_b, v_a, v_b, ha, hb, array[250, 200, 6, 3, 250, 100], v_mode, v_map));
    raise exception 'FAIL: screenshots in the other team''s folder accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%screenshot%' then raise; end if;
  end;
  begin
    perform public.submit_report(v_m1, pg_temp.rep(v_m1, v_a, v_a, v_b, array[u[1], u[2], u[3], u[9]], hb, array[250, 200, 6, 3, 250, 100], v_mode, v_map));
    raise exception 'FAIL: player off the roster accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%roster%' then raise; end if;
  end;
  begin
    perform public.submit_report(v_future, pg_temp.rep(v_future, v_a, v_a, v_b, ha, hb, array[250, 200, 6, 3, 250, 100], v_mode, v_map));
    raise exception 'FAIL: report before the match time accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%opens at the scheduled%' then raise; end if;
  end;
  begin
    insert into public.report_submissions (match_id, team_id, submitted_by, home_series, away_series) values (v_m1, v_a, u[1], 3, 0);
    raise exception 'FAIL: direct insert allowed';
  exception when insufficient_privilege then null;
  end;
  v_checks := v_checks + 7;

  -- One report: waiting for the opponent.
  v_status := public.submit_report(v_m1, r_a1);
  if v_status <> 'awaiting_reports' or exists (select 1 from public.match_maps where match_id = v_m1) then
    raise exception 'FAIL: single report should wait (%)', v_status;
  end if;
  v_checks := v_checks + 1;

  perform public.submit_report(v_m2, r_a2);
  perform public.submit_report(v_m3, r_a3);
  perform public.submit_report(v_m4, r_a4);
  reset role;

  -- ---- Captain B ----------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u[5], 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- No peeking at the opponent's report or screenshots before the match is settled.
  if exists (select 1 from public.report_submissions where match_id = v_m1)
     or exists (select 1 from storage.objects where bucket_id = 'screenshots' and name like format('matches/%s/%s/%%', v_m1, v_a)) then
    raise exception 'FAIL: opponent report visible before confirmation';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'screenshots' and name like format('matches/%s/%s/%%', v_m1, v_b)) then
    raise exception 'FAIL: own screenshots should be visible';
  end if;
  v_checks := v_checks + 1;

  -- Identical reports: confirmed, maps and stats written, no mismatches.
  v_status := public.submit_report(v_m1, r_b1);
  if v_status <> 'confirmed' then
    raise exception 'FAIL: identical reports should confirm (%)', v_status;
  end if;
  v_checks := v_checks + 1;

  -- One kill different: still confirmed (scores agree), exactly one mismatch.
  v_status := public.submit_report(v_m2, r_b2);
  if v_status <> 'confirmed' then
    raise exception 'FAIL: stat-only mismatch should still confirm the result (%)', v_status;
  end if;
  v_checks := v_checks + 1;

  -- Different map score: disputed.
  v_status := public.submit_report(v_m3, r_b3);
  if v_status <> 'disputed' then
    raise exception 'FAIL: map score mismatch should dispute (%)', v_status;
  end if;
  v_checks := v_checks + 1;

  -- Now settled: both reports are visible on match 1.
  if (select count(*) from public.report_submissions where match_id = v_m1) <> 2 then
    raise exception 'FAIL: both reports should be visible once confirmed';
  end if;
  v_checks := v_checks + 1;
  reset role;

  -- Match 1 results.
  if not exists (select 1 from public.matches where id = v_m1 and home_series = 3 and away_series = 0 and winner_team_id = v_a and result_source = 'double_entry')
     or (select count(*) from public.match_maps where match_id = v_m1 and stats_status = 'confirmed' and home_score is not null) <> 3
     or (select count(*) from public.player_map_stats s join public.match_maps mm on mm.id = s.match_map_id where mm.match_id = v_m1) <> 24
     or exists (select 1 from public.stat_mismatches s join public.match_maps mm on mm.id = s.match_map_id where mm.match_id = v_m1) then
    raise exception 'FAIL: confirmed match 1 data wrong';
  end if;
  v_checks := v_checks + 1;

  -- Match 2: 3-2 home, one kills mismatch on map 2, 39 confirmed stat lines.
  if not exists (select 1 from public.matches where id = v_m2 and home_series = 3 and away_series = 2 and winner_team_id = v_a)
     or (select count(*) from public.stat_mismatches s join public.match_maps mm on mm.id = s.match_map_id where mm.match_id = v_m2) <> 1
     or not exists (select 1 from public.stat_mismatches s join public.match_maps mm on mm.id = s.match_map_id
                     where mm.match_id = v_m2 and mm.map_number = 2 and s.kind = 'player_stat' and s.user_id = u[6] and s.field = 'kills')
     or (select stats_status from public.match_maps where match_id = v_m2 and map_number = 2) <> 'mismatch'
     or (select count(*) from public.player_map_stats s join public.match_maps mm on mm.id = s.match_map_id where mm.match_id = v_m2) <> 39 then
    raise exception 'FAIL: match 2 mismatch handling wrong';
  end if;
  v_checks := v_checks + 1;

  -- Match 3: one map_score mismatch, no series.
  if (select count(*) from public.stat_mismatches s join public.match_maps mm on mm.id = s.match_map_id
       where mm.match_id = v_m3 and s.kind = 'map_score') <> 1
     or exists (select 1 from public.matches where id = v_m3 and (home_series is not null or winner_team_id is not null)) then
    raise exception 'FAIL: match 3 map mismatch wrong';
  end if;
  -- Idempotent: comparing again gives the same rows.
  perform public.compare_reports(v_m3);
  perform public.compare_reports(v_m3);
  if (select count(*) from public.stat_mismatches s join public.match_maps mm on mm.id = s.match_map_id where mm.match_id = v_m3) <> 1
     or (select count(*) from public.match_maps where match_id = v_m3) <> 3 then
    raise exception 'FAIL: compare_reports is not idempotent';
  end if;
  v_checks := v_checks + 2;

  -- ---- Captain A sees which fields mismatched, not the values; fixes match 3 ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_json := public.my_match_report_status(v_m2);
  if jsonb_array_length(v_json -> 'mismatches') <> 1
     or v_json -> 'mismatches' -> 0 ->> 'field' <> 'kills'
     or (v_json -> 'mismatches' -> 0) ? 'home_value' then
    raise exception 'FAIL: report status for captains wrong: %', v_json;
  end if;
  if exists (select 1 from public.stat_mismatches) then
    raise exception 'FAIL: captains must not read mismatch values directly';
  end if;
  v_checks := v_checks + 2;

  v_status := public.submit_report(v_m3, r_a3fix);
  if v_status <> 'confirmed' then
    raise exception 'FAIL: corrected resubmission should confirm (%)', v_status;
  end if;
  begin
    perform public.submit_report(v_m3, r_a3fix);
    raise exception 'FAIL: resubmitting a confirmed match allowed';
  exception when sqlstate 'P0001' then null;
  end;
  v_checks := v_checks + 2;

  -- Non-captain players can't report.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  begin
    perform public.submit_report(v_m4, r_a4);
    raise exception 'FAIL: non-captain reported';
  exception when insufficient_privilege then null;
  end;
  v_checks := v_checks + 1;
  reset role;

  -- ---- 24-hour rule -------------------------------------------------------------------
  v_n := public.auto_confirm_reports();
  if v_n < 1
     or not exists (select 1 from public.matches where id = v_m4 and status = 'confirmed' and result_source = 'single_report'
                     and home_series = 0 and away_series = 3 and winner_team_id = v_b)
     or not exists (select 1 from public.audit_log where table_name = 'matches' and row_id = v_m4::text and actor_role = 'system'
                     and new_data ->> 'result_source' = 'single_report')
     or (select count(*) from public.player_map_stats s join public.match_maps mm on mm.id = s.match_map_id where mm.match_id = v_m4) <> 24 then
    raise exception 'FAIL: 24-hour rule did not confirm match 4';
  end if;
  -- Matches inside 24 hours are left alone.
  if exists (select 1 from public.matches where id in (v_m1, v_m2, v_m3) and result_source = 'single_report') then
    raise exception 'FAIL: 24-hour rule touched a recent match';
  end if;
  v_checks := v_checks + 2;

  -- Comparisons don't flood the audit log.
  if exists (select 1 from public.audit_log where table_name in ('match_maps', 'player_map_stats', 'stat_mismatches')
              and created_at >= now() and (old_data ->> 'match_id' = any (array[v_m1, v_m2, v_m3]::text[]) or new_data ->> 'match_id' = any (array[v_m1, v_m2, v_m3]::text[]))) then
    raise exception 'FAIL: comparison rows were audit-logged';
  end if;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
