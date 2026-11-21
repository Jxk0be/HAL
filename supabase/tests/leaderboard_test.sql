-- Player leaderboard tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
-- Everyone with data is listed; missing or disputed stats and admin flags mark a row incomplete.
do $test$
declare
  a uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  b uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_admin uuid := gen_random_uuid();
  v_loner uuid := gen_random_uuid();
  v_season uuid;
  v_ta uuid; v_tb uuid;
  v_mode uuid; v_map uuid;
  v_match uuid; v_mm uuid;
  r record;
  v_checks int := 0;
  x uuid;
begin
  foreach x in array a || b || array[v_admin, v_loner] loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'lb' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'lb' || left(id::text, 6) || '#1234567', platform = 'xbox',
                             age_confirmed_at = now(), controller_confirmed_at = now()
   where id = any (a || b || array[v_admin, v_loner]);
  -- a[1] is an admin who plays on team A (recusal checks).
  insert into public.staff_roles (user_id, role) values (v_admin, 'admin'), (a[1], 'admin');

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('LB ' || gen_random_uuid(), 'signups') returning id into v_season;
  end if;
  update public.seasons set status = 'signups', roster_lock_at = null where id = v_season;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'LB A ' || left(gen_random_uuid()::text, 4), 'LBA', a[1], 'approved') returning id into v_ta;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'LB B ' || left(gen_random_uuid()::text, 4), 'LBB', b[1], 'approved') returning id into v_tb;
  insert into public.team_members (team_id, user_id) values (v_ta, a[2]), (v_ta, a[3]), (v_ta, a[4]), (v_tb, b[2]), (v_tb, b[3]), (v_tb, b[4]);

  insert into public.game_modes (name) values ('LB HP ' || gen_random_uuid()) returning id into v_mode;
  insert into public.maps (name) values ('LB Map ' || gen_random_uuid()) returning id into v_map;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_ta, v_tb, now() - interval '2 hours', now() - interval '2 hours') returning id into v_match;
  -- Check-in needs players rostered 24h before the match.
  update public.team_members set joined_at = now() - interval '3 days' where team_id in (v_ta, v_tb);
  insert into public.checkins (match_id, team_id, captain_id, player_ids) values
    (v_match, v_ta, a[1], a), (v_match, v_tb, b[1], b);
  insert into public.match_maps (match_id, map_number, mode_id, map_id, home_score, away_score, winner_team_id)
  values (v_match, 1, v_mode, v_map, 250, 200, v_ta) returning id into v_mm;
  -- Team A: a[2]'s line is in an open mismatch (no confirmed line). a[3] has no deaths.
  insert into public.player_map_stats (match_map_id, user_id, team_id, kills, deaths, score) values
    (v_mm, a[1], v_ta, 30, 20, 3000), (v_mm, a[3], v_ta, 12, 0, 1500), (v_mm, a[4], v_ta, 20, 20, 2000),
    -- Team B: only 3 lines, b[4] is missing.
    (v_mm, b[1], v_tb, 25, 25, 2500), (v_mm, b[2], v_tb, 20, 22, 2100), (v_mm, b[3], v_tb, 18, 21, 1900);
  insert into public.stat_mismatches (match_map_id, kind, user_id, field, home_value, away_value)
  values (v_mm, 'player_stat', a[2], 'kills', '22', '21');
  update public.matches set status = 'confirmed' where id = v_match;

  -- Recusal: the playing admin can't flag a teammate or themselves; the other admin can flag anyone.
  perform set_config('request.jwt.claims', json_build_object('sub', a[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.player_stat_flags (season_id, user_id) values (v_season, a[4]);
    raise exception 'FAIL: admin flagged a teammate';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into public.player_stat_flags (season_id, user_id) values (v_season, a[1]);
    raise exception 'FAIL: admin flagged themselves';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b[2], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.player_stat_flags (season_id, user_id) values (v_season, b[3]);
    raise exception 'FAIL: a player flagged stats';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.player_stat_flags (season_id, user_id, note) values (v_season, a[4], 'Map 2 scoreboard was lost');
  insert into public.player_stat_flags (season_id, user_id) values (v_season, v_loner);
  reset role;
  v_checks := v_checks + 4;

  -- Read the leaderboard as a logged-out visitor.
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  create temp table lb on commit drop as select * from public.season_leaderboard(v_season);
  reset role;

  if (select count(*) from lb where user_id = any (a || b || array[v_loner])) <> 9 then
    raise exception 'FAIL: expected all 8 checked-in players plus the flagged one, got %',
      (select count(*) from lb where user_id = any (a || b || array[v_loner]));
  end if;
  v_checks := v_checks + 1;

  select * into r from lb where user_id = a[1];
  if r.kills <> 30 or r.deaths <> 20 or r.kd <> 1.50 or r.plus_minus <> 10 or r.avg_score <> 3000
     or r.maps_played <> 1 or r.team_tag <> 'LBA' or r.incomplete then
    raise exception 'FAIL: a1 row wrong %', row_to_json(r);
  end if;
  select * into r from lb where user_id = a[3];
  if r.kd <> 12 or r.incomplete then
    raise exception 'FAIL: zero deaths should give K/D = kills %', row_to_json(r);
  end if;
  v_checks := v_checks + 2;

  select * into r from lb where user_id = a[2];
  if r.maps_played <> 0 or not r.incomplete or r.incomplete_reason not like '%mismatch%' or r.kd is not null then
    raise exception 'FAIL: mismatched player should be listed and incomplete %', row_to_json(r);
  end if;
  select * into r from lb where user_id = b[4];
  if not r.incomplete or r.incomplete_reason not like '%missing%' then
    raise exception 'FAIL: player missing from the scoreboard should be incomplete %', row_to_json(r);
  end if;
  select * into r from lb where user_id = b[1];
  if r.incomplete then
    raise exception 'FAIL: teammate with a stat line should not be incomplete %', row_to_json(r);
  end if;
  select * into r from lb where user_id = a[4];
  if not r.incomplete or r.incomplete_reason <> 'Map 2 scoreboard was lost' then
    raise exception 'FAIL: flag note not shown %', row_to_json(r);
  end if;
  select * into r from lb where user_id = v_loner;
  if not r.incomplete or r.incomplete_reason <> 'Marked incomplete by league staff' or r.team_id is not null then
    raise exception 'FAIL: flagged free agent row wrong %', row_to_json(r);
  end if;
  v_checks := v_checks + 5;

  -- Unconfirmed matches don't count.
  update public.matches set status = 'awaiting_reports' where id = v_match;
  if exists (select 1 from public.season_leaderboard(v_season) where user_id = a[1]) then
    raise exception 'FAIL: unconfirmed match counted';
  end if;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
