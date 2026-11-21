-- Reschedule tests for the bot path (request_reschedule_as / respond_reschedule_as) (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
do $test$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_season uuid;
  v_tz text;
  v_a uuid; v_b uuid;
  v_next_week timestamp;
  v_default timestamptz;
  v_m1 uuid; v_m2 uuid; v_m3 uuid; v_m4 uuid;
  v_req uuid;
  v_dispute uuid;
  v_outbox_before bigint;
  x uuid;
  v_checks int := 0;
begin
  foreach x in array u loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'rs' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'rs' || left(id::text, 6) || '#1234567' where id = any (u);

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('Resched ' || gen_random_uuid(), 'regular') returning id into v_season;
  end if;
  update public.seasons set status = 'regular' where id = v_season;
  select timezone into v_tz from public.seasons where id = v_season;

  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Alpha ' || left(gen_random_uuid()::text, 4), 'RSA', u[1], 'approved') returning id into v_a;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Bravo ' || left(gen_random_uuid()::text, 4), 'RSB', u[2], 'approved') returning id into v_b;
  insert into public.team_members (team_id, user_id) values (v_a, u[3]);

  -- Match 1: next week's Wednesday 9 PM league time. Match 2: 20 hours from now.
  v_next_week := date_trunc('week', now() at time zone v_tz) + interval '7 days';
  v_default := (v_next_week + interval '2 days 21 hours') at time zone v_tz;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_a, v_b, v_default, v_default) returning id into v_m1;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 2, v_a, v_b, now() + interval '20 hours', now() + interval '20 hours') returning id into v_m2;
  -- Match 3 was played an hour ago and confirmed. Match 4 was two days ago.
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at, status, home_series, away_series, winner_team_id, confirmed_at, result_source)
  values (v_season, 3, v_a, v_b, now() - interval '1 hour', now() - interval '1 hour', 'confirmed', 3, 1, v_a, now(), 'double_entry') returning id into v_m3;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at, status, confirmed_at)
  values (v_season, 4, v_a, v_b, now() - interval '3 days', now() - interval '3 days', 'confirmed', now() - interval '3 days') returning id into v_m4;
  select coalesce(max(id), 0) into v_outbox_before from public.notifications_outbox;

  -- ---- Captain A requests ------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.request_reschedule(v_m2, now() + interval '21 hours');
    raise exception 'FAIL: request 20h before the match accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%24 hours%' and sqlerrm not like '%same league week%' then raise; end if;
  end;
  begin
    perform public.request_reschedule(v_m1, v_default + interval '7 days');
    raise exception 'FAIL: request for the following week accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%same league week%' then raise; end if;
  end;
  v_req := public.request_reschedule(v_m1, v_default + interval '1 day');
  begin
    perform public.request_reschedule(v_m1, v_default + interval '2 hours');
    raise exception 'FAIL: second pending request accepted';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.respond_reschedule(v_req, true);
    raise exception 'FAIL: requester accepted their own request';
  exception when insufficient_privilege then null;
  end;
  v_checks := v_checks + 4;

  -- A player who isn't captain can't request.
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  begin
    perform public.request_reschedule(v_m1, v_default + interval '3 hours');
    raise exception 'FAIL: non-captain requested';
  exception when insufficient_privilege then null;
  end;
  v_checks := v_checks + 1;

  -- ---- Captain B accepts -------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  perform public.respond_reschedule(v_req, true);
  if (select scheduled_at from public.matches where id = v_m1) <> v_default + interval '1 day'
     or (select default_at from public.matches where id = v_m1) <> v_default then
    raise exception 'FAIL: accepting should move scheduled_at only';
  end if;
  -- B asks to move it back; A declines; B asks again and cancels.
  v_req := public.request_reschedule(v_m1, v_default);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.respond_reschedule(v_req, false);
  begin
    perform public.cancel_reschedule(v_req);
    raise exception 'FAIL: cancelled an answered request';
  exception when sqlstate 'P0001' or insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  v_req := public.request_reschedule(v_m1, v_default + interval '2 hours');
  perform public.cancel_reschedule(v_req);
  v_req := public.request_reschedule(v_m1, v_default + interval '3 hours');
  reset role;
  if (select scheduled_at from public.matches where id = v_m1) <> v_default + interval '1 day' then
    raise exception 'FAIL: declined request moved the match';
  end if;
  v_checks := v_checks + 2;

  -- Bot path (service role): same rules through the _as functions.
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.respond_reschedule_as(u[2], v_req, true);
    raise exception 'FAIL: requesting team answered its own request (bot)';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.request_reschedule_as(u[3], v_m1, v_default + interval '4 hours');
    raise exception 'FAIL: non-captain requested (bot)';
  exception when insufficient_privilege then null;
  end;
  if not exists (select 1 from public.reschedulable_matches_for(u[1]) where match_id = v_m1)
     or exists (select 1 from public.reschedulable_matches_for(u[1]) where match_id = v_m2) then
    raise exception 'FAIL: reschedulable matches wrong';
  end if;
  if public.respond_reschedule_as(u[1], v_req, false) <> 'declined'
     or (select responded_by from public.reschedule_requests where id = v_req) <> u[1] then
    raise exception 'FAIL: bot decline not recorded';
  end if;
  v_req := public.request_reschedule_as(u[1], v_m1, v_default + interval '5 hours');
  perform public.respond_reschedule_as(u[2], v_req, true);
  if (select scheduled_at from public.matches where id = v_m1) <> v_default + interval '5 hours' then
    raise exception 'FAIL: bot accept did not move the match';
  end if;
  v_checks := v_checks + 5;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
