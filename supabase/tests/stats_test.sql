-- Standings and stats tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
do $test$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_season uuid;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid;
  v_mode uuid; v_map uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid;
  v_mm uuid;
  v_order text;
  v_checks int := 0;
  x uuid;
begin
  foreach x in array u loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'st' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'st' || left(id::text, 6) || '#1234567' where id = any (u);

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('Stats ' || gen_random_uuid(), 'regular') returning id into v_season;
  end if;
  update public.seasons set status = 'regular' where id = v_season;

  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Alpha ' || left(gen_random_uuid()::text,4), 'AA', u[1], 'approved') returning id into v_a;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Bravo ' || left(gen_random_uuid()::text,4), 'BB', u[2], 'approved') returning id into v_b;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Charlie ' || left(gen_random_uuid()::text,4), 'CC', u[3], 'approved') returning id into v_c;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Delta ' || left(gen_random_uuid()::text,4), 'DD', u[4], 'approved') returning id into v_d;
  insert into public.game_modes (name) values ('HP ' || gen_random_uuid()) returning id into v_mode;
  insert into public.maps (name) values ('Map ' || gen_random_uuid()) returning id into v_map;

  -- A beats B 3-1; C beats D by forfeit; B beats C 3-2.
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at, status, home_series, away_series, winner_team_id)
  values (v_season, 1, v_a, v_b, now() - interval '3 days', now() - interval '3 days', 'confirmed', 3, 1, v_a) returning id into v_m1;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at, status, forfeit_team_id, winner_team_id)
  values (v_season, 1, v_c, v_d, now() - interval '3 days', now() - interval '3 days', 'forfeit', v_d, v_c) returning id into v_m2;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at, status, home_series, away_series, winner_team_id)
  values (v_season, 2, v_b, v_c, now() - interval '1 day', now() - interval '1 day', 'confirmed', 3, 2, v_b) returning id into v_m3;

  -- Maps for A v B (4 maps) with player stats on map 1, and the deciding map of B v C.
  insert into public.match_maps (match_id, map_number, mode_id, map_id, home_score, away_score) values (v_m1, 1, v_mode, v_map, 250, 200) returning id into v_mm;
  insert into public.match_maps (match_id, map_number, mode_id, map_id, home_score, away_score) values
    (v_m1, 2, v_mode, v_map, 6, 3), (v_m1, 3, v_mode, v_map, 100, 250), (v_m1, 4, v_mode, v_map, 250, 240),
    (v_m3, 5, v_mode, v_map, 6, 5);
  insert into public.player_map_stats (match_map_id, user_id, team_id, kills, deaths, score)
  values (v_mm, u[1], v_a, 30, 20, 9000), (v_mm, u[2], v_b, 20, 30, 7000);

  -- Standings: A 1-0 (+2), C 1-1 (+2: 3-0 forfeit win, 2-3 loss), B 1-1 (-1), D 0-1 (-3).
  -- A and C tie on wins and map diff; A is ahead on deciding-map rounds (+10 vs -1).
  select string_agg(tag || ':' || wins || '-' || losses || ':' || map_diff, ' ' order by rank) into v_order
    from public.division_standings(v_season) where team_id in (v_a, v_b, v_c, v_d);
  if v_order <> 'AA:1-0:2 CC:1-1:2 BB:1-1:-1 DD:0-1:-3' then
    raise exception 'FAIL: standings order %', v_order;
  end if;
  if (select last5 from public.division_standings(v_season) where team_id = v_c) <> array['L', 'W'] then
    raise exception 'FAIL: last 5 should be newest first';
  end if;
  v_checks := v_checks + 2;

  -- Player stats (confirmed values only), K/D and the 40% qualifier.
  if not exists (
    select 1 from public.player_season_stats_v
     where user_id = u[1] and season_id = v_season and kills = 30 and deaths = 20 and kd = 1.50
       and plus_minus = 10 and avg_score = 9000 and maps_played = 1 and team_maps_played = 4
       and not qualifies  -- 1 of 4 team maps is under the 40% minimum
  ) then
    raise exception 'FAIL: player stats wrong';
  end if;
  v_checks := v_checks + 1;

  -- Mode record: A won 3 of 4 maps against B.
  if not exists (select 1 from public.team_mode_records_v where team_id = v_a and mode_id = v_mode and wins = 3 and losses = 1) then
    raise exception 'FAIL: mode record wrong';
  end if;
  v_checks := v_checks + 1;

  -- Visitors can read standings and stats (no Discord names involved).
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  if not exists (select 1 from public.division_standings(v_season) where team_id = v_a)
     or not exists (select 1 from public.player_season_stats_v where user_id = u[1]) then
    raise exception 'FAIL: anon cannot read standings or stats';
  end if;
  reset role;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
