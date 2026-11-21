-- Check-in and results-notification tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
do $test$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                    gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_season uuid;
  v_a uuid; v_b uuid;
  v_m uuid; v_late uuid; v_future uuid;
  v_json jsonb;
  v_outbox bigint;
  x uuid;
  v_checks int := 0;
begin
  foreach x in array u loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'ci' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'ci' || left(id::text, 6) || '#1234567' where id = any (u);

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('Checkin ' || gen_random_uuid(), 'regular') returning id into v_season;
  end if;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Alpha ' || left(gen_random_uuid()::text, 4), 'CIA', u[1], 'approved') returning id into v_a;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Bravo ' || left(gen_random_uuid()::text, 4), 'CIB', u[7], 'approved') returning id into v_b;
  insert into public.team_members (team_id, user_id, role)
  values (v_a, u[2], 'starter'), (v_a, u[3], 'starter'), (v_a, u[4], 'starter'), (v_a, u[5], 'sub'), (v_a, u[6], 'sub');
  -- Everyone joined two days ago except u5 (an hour ago); u6 is banned.
  update public.team_members set joined_at = now() - interval '2 days' where team_id = v_a;
  update public.team_members set joined_at = now() - interval '1 hour' where team_id = v_a and user_id = u[5];
  update public.profiles set banned_until = now() + interval '7 days' where id = u[6];

  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_a, v_b, now() + interval '10 minutes', now() + interval '10 minutes') returning id into v_m;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 2, v_a, v_b, now() - interval '40 minutes', now() - interval '40 minutes') returning id into v_late;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 3, v_a, v_b, now() + interval '2 hours', now() + interval '2 hours') returning id into v_future;
  select coalesce(max(id), 0) into v_outbox from public.notifications_outbox;

  -- Eligible: captain plus u2, u3, u4.
  if (select array_agg(user_id order by user_id) from public.eligible_checkin_players(v_m, v_a))
     <> (select array_agg(e.id order by e.id) from unnest(array[u[1], u[2], u[3], u[4]]) e(id)) then
    raise exception 'FAIL: eligible players wrong';
  end if;
  v_checks := v_checks + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.check_in(v_m, array[u[1], u[2], u[3], u[4]]);
    raise exception 'FAIL: non-captain checked in';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  begin
    perform public.check_in(v_future, array[u[1], u[2], u[3], u[4]]);
    raise exception 'FAIL: checked in too early';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.check_in(v_late, array[u[1], u[2], u[3], u[4]]);
    raise exception 'FAIL: checked in 40 minutes late';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.check_in(v_m, array[u[1], u[2], u[3], u[5]]);
    raise exception 'FAIL: player added within 24h accepted';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.check_in(v_m, array[u[1], u[2], u[3], u[6]]);
    raise exception 'FAIL: banned player accepted';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.check_in(v_m, array[u[1], u[2], u[3]]);
    raise exception 'FAIL: three players accepted';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    insert into public.checkins (match_id, team_id, captain_id, player_ids) values (v_m, v_a, u[1], array[u[1], u[2], u[3], u[4]]);
    raise exception 'FAIL: direct check-in insert allowed';
  exception when insufficient_privilege then null;
  end;
  v_checks := v_checks + 7;

  v_json := public.check_in(v_m, array[u[1], u[2], u[3], u[4]]);
  if jsonb_array_length(v_json -> 'players') <> 4 or (v_json ->> 'team_id')::uuid <> v_a then
    raise exception 'FAIL: check-in result wrong: %', v_json;
  end if;
  -- Checking in again replaces the line-up.
  perform public.check_in(v_m, array[u[4], u[3], u[2], u[1]]);
  reset role;
  if (select status from public.matches where id = v_m) <> 'checkin_open'
     or (select count(*) from public.checkins where match_id = v_m) <> 1 then
    raise exception 'FAIL: check-in should open the match and keep one row per team';
  end if;
  v_checks := v_checks + 2;

  -- The bot path (service role, no uid) works for a captain's HAL id.
  perform set_config('request.jwt.claims', '', true);
  v_json := public.check_in_as(u[1], v_m, array[u[1], u[2], u[3], u[4]], 'discord');
  if (select source from public.checkins where match_id = v_m and team_id = v_a) <> 'discord' then
    raise exception 'FAIL: bot check-in not recorded';
  end if;
  v_checks := v_checks + 1;

  -- Confirming a match queues a result post; check-ins queue confirmations.
  update public.matches set status = 'confirmed', home_series = 3, away_series = 1, winner_team_id = v_a where id = v_m;
  if (select count(*) from public.notifications_outbox where id > v_outbox and type = 'match_result' and payload ->> 'match_id' = v_m::text) <> 1
     or (select count(*) from public.notifications_outbox where id > v_outbox and type = 'checked_in') < 3 then
    raise exception 'FAIL: outbox events missing';
  end if;
  -- An unrelated update does not re-post.
  update public.matches set broadcast_url = 'https://twitch.tv/x' where id = v_m;
  if (select count(*) from public.notifications_outbox where id > v_outbox and type = 'match_result') <> 1 then
    raise exception 'FAIL: result re-queued on an unrelated change';
  end if;
  v_checks := v_checks + 2;

  -- bot_events: one post per match, team and kind.
  insert into public.bot_events (match_id, team_id, kind) values (v_m, v_a, 'reminder_1h');
  begin
    insert into public.bot_events (match_id, team_id, kind) values (v_m, v_a, 'reminder_1h');
    raise exception 'FAIL: duplicate bot event allowed';
  exception when unique_violation then null;
  end;
  insert into public.bot_events (match_id, team_id, kind) values (v_m, null, 'result');
  begin
    insert into public.bot_events (match_id, team_id, kind) values (v_m, null, 'result');
    raise exception 'FAIL: duplicate team-less bot event allowed';
  exception when unique_violation then null;
  end;
  v_checks := v_checks + 2;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
