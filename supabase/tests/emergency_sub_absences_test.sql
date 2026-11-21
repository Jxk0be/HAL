-- Late dropouts (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
-- A team of 5 has 2 players drop out an hour before: the captain marks them out and requests a sub.
do $test$
declare
  a uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  b uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  fa uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_admin uuid := gen_random_uuid();
  v_season uuid;
  v_ta uuid; v_tb uuid; v_match uuid;
  v_r1 uuid; v_r2 uuid;
  v_checks int := 0;
  x uuid;
begin
  foreach x in array a || b || fa || array[v_admin] loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'ab' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'ab' || left(id::text, 6) || '#1234567', platform = 'xbox',
                             age_confirmed_at = now(), controller_confirmed_at = now()
   where id = any (a || b || fa || array[v_admin]);
  insert into public.staff_roles (user_id, role) values (v_admin, 'admin');

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('AB ' || gen_random_uuid(), 'signups') returning id into v_season;
  end if;
  update public.seasons set status = 'signups', roster_lock_at = null where id = v_season;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'AB A ' || left(gen_random_uuid()::text, 4), 'ABA', a[1], 'approved') returning id into v_ta;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'AB B ' || left(gen_random_uuid()::text, 4), 'ABB', b[1], 'approved') returning id into v_tb;
  insert into public.team_members (team_id, user_id, role) values (v_ta, a[2], 'starter'), (v_ta, a[3], 'starter'), (v_ta, a[4], 'starter'), (v_ta, a[5], 'sub'),
    (v_tb, b[2], 'starter'), (v_tb, b[3], 'starter'), (v_tb, b[4], 'starter');
  update public.team_members set joined_at = now() - interval '3 days' where team_id in (v_ta, v_tb);
  -- An hour before the match.
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_ta, v_tb, now() + interval '1 hour', now() + interval '1 hour') returning id into v_match;

  perform set_config('request.jwt.claims', json_build_object('sub', a[1], 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 5 eligible, nobody marked out: refused.
  begin
    perform public.request_emergency_sub(v_match, v_ta, fa[1]);
    raise exception 'FAIL: request allowed with 5 available';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- Marking only one out still leaves 4: refused.
  begin
    perform public.request_emergency_sub(v_match, v_ta, fa[1], array[a[4]], 'Work');
    raise exception 'FAIL: request allowed with 4 available';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  v_checks := v_checks + 2;

  -- The sub and the 4th are out: allowed. Two requests (hedging) are fine, a third isn't.
  v_r1 := public.request_emergency_sub(v_match, v_ta, fa[1], array[a[4], a[5]], 'Sick and working late', 'Need one tonight');
  v_r2 := public.request_emergency_sub(v_match, v_ta, fa[2]);
  begin
    perform public.request_emergency_sub(v_match, v_ta, fa[3]);
    raise exception 'FAIL: third emergency sub request allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  if public.available_players(v_match, v_ta) <> 3
     or (select count(*) from public.match_absences where match_id = v_match and team_id = v_ta) <> 2 then
    raise exception 'FAIL: absences not recorded';
  end if;
  reset role;
  v_checks := v_checks + 2;

  -- A player from another team can't be marked out by this captain.
  set local role authenticated;
  begin
    insert into public.match_absences (match_id, team_id, user_id) values (v_match, v_tb, b[2]);
    raise exception 'FAIL: captain marked the opponent out';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 1;

  -- Both free agents accept; the team is only 1 short, so only one can be approved.
  perform set_config('request.jwt.claims', '', true);
  perform public.respond_emergency_sub_as(fa[1], v_r1, true);
  perform public.respond_emergency_sub_as(fa[2], v_r2, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.roster_requests set status = 'approved' where id = v_r1;
  begin
    update public.roster_requests set status = 'approved' where id = v_r2;
    raise exception 'FAIL: approved more subs than the team is short';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 1;

  -- Check-in: the sub counts, players marked out don't, and they stay out once a sub is approved.
  perform set_config('request.jwt.claims', json_build_object('sub', a[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from public.eligible_checkin_players(v_match, v_ta)) <> 4
     or exists (select 1 from public.eligible_checkin_players(v_match, v_ta) where user_id in (a[4], a[5]))
     or not exists (select 1 from public.eligible_checkin_players(v_match, v_ta) where user_id = fa[1] and is_emergency) then
    raise exception 'FAIL: check-in list wrong';
  end if;
  begin
    delete from public.match_absences where match_id = v_match and user_id = a[4];
    raise exception 'FAIL: player taken off the out list after a sub was approved';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 2;

  -- Check in 15 minutes before: the out player is refused, the sub is accepted.
  update public.matches set scheduled_at = now() + interval '10 minutes' where id = v_match;
  set local role authenticated;
  begin
    perform public.check_in(v_match, array[a[1], a[2], a[3], a[4]]);
    raise exception 'FAIL: checked in a player marked out';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform public.check_in(v_match, array[a[1], a[2], a[3], fa[1]]);
  reset role;
  if not exists (select 1 from public.checkins where match_id = v_match and team_id = v_ta and fa[1] = any (player_ids)) then
    raise exception 'FAIL: check-in with the emergency sub not saved';
  end if;
  v_checks := v_checks + 2;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
