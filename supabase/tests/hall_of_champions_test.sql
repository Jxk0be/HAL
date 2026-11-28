-- Hall of Champions tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
-- The champion is the winner of a completed season's highest confirmed playoff round, with the
-- Activision IDs of the players they checked in for the final. Only completed seasons are listed.
do $test$
declare
  a uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  b uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_season uuid;
  v_ta uuid; v_tb uuid;
  v_semi uuid; v_final uuid;
  r record;
  v_n int;
  v_checks int := 0;
  x uuid;
begin
  foreach x in array a || b loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'hc' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'hc' || left(id::text, 6) || '#1234567', platform = 'xbox',
                             age_confirmed_at = now(), controller_confirmed_at = now()
   where id = any (a || b);

  -- A past season, built as a draft, then completed.
  insert into public.seasons (name, status, regular_weeks) values ('HoC ' || gen_random_uuid(), 'draft', 2) returning id into v_season;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'HoC A ' || left(gen_random_uuid()::text, 4), 'HCA', a[1], 'approved') returning id into v_ta;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'HoC B ' || left(gen_random_uuid()::text, 4), 'HCB', b[1], 'approved') returning id into v_tb;
  insert into public.team_members (team_id, user_id) values (v_ta, a[2]), (v_ta, a[3]), (v_ta, a[4]), (v_tb, b[2]), (v_tb, b[3]), (v_tb, b[4]);
  update public.team_members set joined_at = now() - interval '30 days' where team_id in (v_ta, v_tb);

  -- Round 1 (B wins) and the final, round 2 (A wins 3–1 as the away team).
  insert into public.matches (season_id, week, stage, playoff_round, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 3, 'playoff', 1, v_ta, v_tb, now() - interval '9 days', now() - interval '9 days') returning id into v_semi;
  insert into public.matches (season_id, week, stage, playoff_round, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 4, 'playoff', 2, v_tb, v_ta, now() - interval '2 days', now() - interval '2 days') returning id into v_final;
  insert into public.checkins (match_id, team_id, captain_id, player_ids) values
    (v_final, v_ta, a[1], a), (v_final, v_tb, b[1], b);
  update public.matches set status = 'confirmed', home_series = 3, away_series = 0, winner_team_id = v_tb where id = v_semi;
  update public.matches set status = 'confirmed', home_series = 1, away_series = 3, winner_team_id = v_ta where id = v_final;

  -- Not complete yet: not listed.
  select count(*) into v_n from public.hall_of_champions() h where h.season_id = v_season;
  if v_n <> 0 then raise exception 'FAIL: listed a season that is not complete'; end if;
  v_checks := v_checks + 1;

  update public.seasons set status = 'complete' where id = v_season;

  select count(*) into v_n from public.hall_of_champions() h where h.season_id = v_season;
  if v_n <> 1 then raise exception 'FAIL: expected one champion row, got %', v_n; end if;
  v_checks := v_checks + 1;

  select * into r from public.hall_of_champions() h where h.season_id = v_season;
  if r.team_id <> v_ta then raise exception 'FAIL: champion should be the final''s winner, not round 1''s'; end if;
  v_checks := v_checks + 1;
  if r.champion_series <> 3 or r.opponent_series <> 1 then
    raise exception 'FAIL: score from the champion''s side should be 3–1, got %–%', r.champion_series, r.opponent_series;
  end if;
  v_checks := v_checks + 1;
  if r.opponent_tag <> 'HCB' then raise exception 'FAIL: wrong opponent'; end if;
  v_checks := v_checks + 1;
  if cardinality(r.starters) <> 4 or not ('hc' || left(a[2]::text, 6) || '#1234567' = any (r.starters)) then
    raise exception 'FAIL: starters should be the 4 checked-in Activision IDs, got %', r.starters;
  end if;
  v_checks := v_checks + 1;

  -- Anyone can read it, logged out included.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into v_n from public.hall_of_champions() h where h.season_id = v_season;
  reset role;
  if v_n <> 1 then raise exception 'FAIL: anon could not read the hall of champions'; end if;
  v_checks := v_checks + 1;

  -- Nothing private in the shape: no Discord columns.
  if pg_get_function_result('public.hall_of_champions'::regproc) ~* 'discord' then
    raise exception 'FAIL: hall_of_champions exposes Discord data';
  end if;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end
$test$;
