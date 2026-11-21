-- Admin alert triggers (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
do $test$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_admin uuid := gen_random_uuid();
  v_season uuid; v_ta uuid; v_tb uuid; v_match uuid; v_mm uuid; v_mode uuid; v_map uuid;
  v_checks int := 0; x uuid;
begin
  foreach x in array u || array[v_admin] loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'aa' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'aa' || left(id::text, 6) || '#1234567', platform = 'xbox', age_confirmed_at = now(), controller_confirmed_at = now()
   where id = any (u || array[v_admin]);
  insert into public.staff_roles (user_id, role) values (v_admin, 'admin');
  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then insert into public.seasons (name, status) values ('AA ' || gen_random_uuid(), 'signups') returning id into v_season; end if;
  update public.seasons set status = 'signups' where id = v_season;

  -- A new team (just the captain) doesn't alert; it does when the 4th player joins, once.
  insert into public.teams (season_id, name, tag, captain_id) values (v_season, 'AA A ' || left(gen_random_uuid()::text, 4), 'AAA', u[1]) returning id into v_ta;
  insert into public.team_members (team_id, user_id) values (v_ta, u[2]);
  insert into public.team_members (team_id, user_id) values (v_ta, u[3]);
  if exists (select 1 from public.notifications_outbox where type = 'team_pending' and payload->>'team_id' = v_ta::text) then
    raise exception 'FAIL: alerted before the team had 4 players';
  end if;
  -- Approving at 3 players is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.teams set status = 'approved' where id = v_ta;
    raise exception 'FAIL: approved a 3-player team';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into public.team_members (team_id, user_id) values (v_ta, u[4]);
  insert into public.team_members (team_id, user_id, role) values (v_ta, u[5], 'sub');
  if (select count(*) from public.notifications_outbox where type = 'team_pending' and payload->>'team_id' = v_ta::text) <> 1 then
    raise exception 'FAIL: expected exactly one alert at 4 players';
  end if;
  -- Now an admin can approve.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.teams set status = 'approved' where id = v_ta;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_checks := v_checks + 3;

  -- Three mismatched fields in one statement: one alert for the match, with the count.
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'AA B ' || left(gen_random_uuid()::text, 4), 'AAB', u[6], 'approved') returning id into v_tb;
  insert into public.game_modes (name) values ('AA HP ' || gen_random_uuid()) returning id into v_mode;
  insert into public.maps (name) values ('AA Map ' || gen_random_uuid()) returning id into v_map;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_ta, v_tb, now() - interval '2 hours', now() - interval '2 hours') returning id into v_match;
  insert into public.match_maps (match_id, map_number, mode_id, map_id) values (v_match, 1, v_mode, v_map) returning id into v_mm;
  insert into public.stat_mismatches (match_map_id, kind, field, home_value, away_value) values
    (v_mm, 'map_score', 'home_score', '250', '240'),
    (v_mm, 'map_score', 'away_score', '200', '210'),
    (v_mm, 'map_score', 'winner', 'a', 'b');
  if (select count(*) from public.notifications_outbox where type = 'mismatch_opened' and payload->>'match_id' = v_match::text) <> 1
     or (select (payload->>'fields')::int from public.notifications_outbox where type = 'mismatch_opened' and payload->>'match_id' = v_match::text) <> 3 then
    raise exception 'FAIL: mismatch alert wrong';
  end if;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
