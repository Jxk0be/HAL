-- create_matches tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
do $test$
declare
  v_admin uuid := gen_random_uuid();
  v_cap_a uuid := gen_random_uuid();
  v_cap_b uuid := gen_random_uuid();
  v_season uuid;
  v_a uuid;
  v_b uuid;
  v_n int;
  v_payload jsonb;
  v_checks int := 0;
  u uuid;
begin
  foreach u in array array[v_admin, v_cap_a, v_cap_b] loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (u, 'authenticated', 'authenticated', u || '@test.hal', jsonb_build_object('provider_id', 'd-' || u, 'full_name', 's' || left(u::text, 6)), now(), now());
  end loop;
  insert into public.staff_roles (user_id, role) values (v_admin, 'admin');
  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('Sched ' || gen_random_uuid(), 'signups') returning id into v_season;
  end if;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'SA ' || left(gen_random_uuid()::text, 5), 'SA', v_cap_a, 'approved') returning id into v_a;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'SB ' || left(gen_random_uuid()::text, 5), 'SB', v_cap_b, 'approved') returning id into v_b;

  v_payload := jsonb_build_array(
    jsonb_build_object('week', 1, 'home_team_id', v_a, 'away_team_id', v_b, 'default_at', '2027-01-06T02:00:00Z'),
    jsonb_build_object('week', 1, 'home_team_id', v_b, 'away_team_id', v_a, 'default_at', '2027-01-08T02:00:00Z'));

  -- Captains can't generate a schedule.
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.create_matches(v_season, v_payload);
    raise exception 'FAIL: captain created matches';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_n := public.create_matches(v_season, v_payload);
  if v_n <> 2 then raise exception 'FAIL: expected 2 matches, got %', v_n; end if;
  begin
    perform public.create_matches(v_season, v_payload);
    raise exception 'FAIL: duplicate schedule allowed without replace';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  v_n := public.create_matches(v_season, v_payload, true);
  reset role;
  if (select count(*) from public.matches where season_id = v_season and v_a in (home_team_id, away_team_id)) <> 2 then
    raise exception 'FAIL: replace did not swap the schedule';
  end if;
  if (select scheduled_at from public.matches where home_team_id = v_a and season_id = v_season) <> '2027-01-06T02:00:00Z' then
    raise exception 'FAIL: scheduled_at should start equal to default_at';
  end if;
  v_checks := v_checks + 4;

  -- Played matches block a replace.
  perform set_config('request.jwt.claims', '', true);
  update public.matches set status = 'confirmed' where home_team_id = v_a and season_id = v_season;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.create_matches(v_season, v_payload, true);
    raise exception 'FAIL: replaced a schedule with played matches';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- Unapproved team rejected.
  update public.teams set status = 'pending' where id = v_b;
  begin
    perform public.create_matches(v_season, jsonb_build_array(
      jsonb_build_object('week', 2, 'home_team_id', v_a, 'away_team_id', v_b, 'default_at', '2027-01-13T02:00:00Z')));
    raise exception 'FAIL: match with a pending team created';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 2;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
