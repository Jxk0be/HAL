-- Reschedule and dispute tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
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

  -- Expiry: pretend the default time is now 23 hours away (runs as the system, like the cron job).
  perform set_config('request.jwt.claims', '', true);
  update public.matches set default_at = now() + interval '23 hours' where id = v_m1;
  perform public.expire_reschedule_requests();
  if (select status from public.reschedule_requests where id = v_req) <> 'expired' then
    raise exception 'FAIL: pending request did not expire';
  end if;
  v_checks := v_checks + 1;

  -- ---- Disputes ----------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.open_dispute(v_m2, 'score', 'They used a banned streak in map 2');
    raise exception 'FAIL: dispute before the match accepted';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.open_dispute(v_m4, 'score', 'Late dispute for an old match');
    raise exception 'FAIL: dispute after the 24h window accepted';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    insert into public.disputes (match_id, team_id, opened_by, reason) values (v_m3, v_b, u[2], 'Direct insert attempt');
    raise exception 'FAIL: direct dispute insert allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.open_dispute(v_m3, 'conduct', 'short');
    raise exception 'FAIL: too-short description accepted';
  exception when sqlstate 'P0001' then null;
  end;
  v_dispute := public.open_dispute(v_m3, 'cheating', 'Their player 3 was using a cronus, clip attached',
    jsonb_build_array(jsonb_build_object('url', 'https://youtu.be/example', 'note', 'Clip of map 2')));
  if (select status from public.matches where id = v_m3) <> 'disputed'
     or (select category from public.disputes where id = v_dispute) <> 'cheating'
     or (select count(*) from public.dispute_evidence where dispute_id = v_dispute) <> 1 then
    raise exception 'FAIL: opening a dispute did not put the match under review';
  end if;
  begin
    perform public.open_dispute(v_m3, 'other', 'A second dispute on the same match');
    raise exception 'FAIL: second open dispute allowed';
  exception when sqlstate 'P0001' then null;
  end;
  perform public.add_dispute_comment(v_dispute, 'Timestamp is 4:12 in the clip.');
  v_checks := v_checks + 7;

  -- The other captain can comment; a regular player can read but not comment.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  perform public.add_dispute_comment(v_dispute, 'We disagree, he was on a standard controller.');
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  if (select count(*) from public.dispute_comments where dispute_id = v_dispute) <> 2 then
    raise exception 'FAIL: party player should read comments';
  end if;
  begin
    perform public.add_dispute_comment(v_dispute, 'I am just a player');
    raise exception 'FAIL: non-captain commented';
  exception when insufficient_privilege then null;
  end;
  -- Reports can't change while the dispute is open.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  begin
    perform public.submit_report(v_m3, '{"maps": []}'::jsonb);
    raise exception 'FAIL: report accepted while disputed';
  exception when sqlstate 'P0001' then null;
  end;
  v_checks := v_checks + 3;
  reset role;

  -- Resolving (upheld) puts the match back to confirmed.
  perform set_config('request.jwt.claims', '', true);
  update public.disputes set status = 'resolved', resolution = 'No evidence of a cronus.' where id = v_dispute;
  if (select status from public.matches where id = v_m3) <> 'confirmed' then
    raise exception 'FAIL: resolving should restore the confirmed result';
  end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.add_dispute_comment(v_dispute, 'One more thing');
    raise exception 'FAIL: commented on a closed dispute';
  exception when sqlstate 'P0001' then null;
  end;
  reset role;
  v_checks := v_checks + 2;

  -- Every event reached the outbox.
  if (select array_agg(distinct type order by type) from public.notifications_outbox where id > v_outbox_before)
     <> array['dispute_comment', 'dispute_opened', 'dispute_resolved', 'reschedule_accepted', 'reschedule_cancelled',
              'reschedule_declined', 'reschedule_expired', 'reschedule_requested'] then
    raise exception 'FAIL: outbox events wrong: %', (select array_agg(distinct type order by type) from public.notifications_outbox where id > v_outbox_before);
  end if;
  -- Players can't read the outbox.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform 1 from public.notifications_outbox limit 1;
    raise exception 'FAIL: outbox readable';
  exception when insufficient_privilege then null;
  end;
  reset role;
  v_checks := v_checks + 2;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
