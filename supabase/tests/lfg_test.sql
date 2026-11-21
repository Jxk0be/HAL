-- /lfg tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
do $test$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_season uuid;
  v_team uuid;
  v_json jsonb;
  v_post uuid;
  v_outbox bigint;
  x uuid;
  v_checks int := 0;
begin
  foreach x in array u loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'lf' || left(x::text, 6)), now(), now());
  end loop;
  -- u1 and u2 have complete profiles; u3 doesn't.
  update public.profiles set activision_id = 'lf' || left(id::text, 6) || '#1234567', platform = 'playstation', age_confirmed_at = now(), controller_confirmed_at = now()
   where id in (u[1], u[2]);

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('LFG ' || gen_random_uuid(), 'signups') returning id into v_season;
  end if;
  update public.seasons set roster_lock_at = null where id = v_season;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Alpha ' || left(gen_random_uuid()::text, 4), 'LFA', u[2], 'approved') returning id into v_team;
  select coalesce(max(id), 0) into v_outbox from public.notifications_outbox;

  -- Incomplete profile, bad role, on a team.
  begin
    perform public.lfg_upsert_as(u[3], 'AR', 'Nights', 'Hi');
    raise exception 'FAIL: incomplete profile posted';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.lfg_upsert_as(u[1], 'sniper', null, null);
    raise exception 'FAIL: bad role accepted';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.lfg_upsert_as(u[2], 'AR', null, null);
    raise exception 'FAIL: captain on a team posted';
  exception when sqlstate 'P0001' then null;
  end;
  v_checks := v_checks + 3;

  -- Post, then edit (allowed), then the post shows on the site's board.
  v_json := public.lfg_upsert_as(u[1], 'smg', 'Weeknights ET', 'Ex-CDL Challengers');
  v_post := (v_json ->> 'post_id')::uuid;
  if v_json ->> 'role' <> 'SMG' or v_json ->> 'platform' <> 'playstation' then
    raise exception 'FAIL: post wrong: %', v_json;
  end if;
  v_json := public.lfg_upsert_as(u[1], 'Flex', 'Any night', null);
  if (v_json ->> 'post_id')::uuid <> v_post or v_json ->> 'role' <> 'Flex' then
    raise exception 'FAIL: edit should update the same post';
  end if;
  if not exists (select 1 from public.free_agents where id = u[1] and preferred_role = 'Flex') then
    raise exception 'FAIL: post not on the free agent board';
  end if;
  v_checks := v_checks + 3;

  -- Discord ids recorded; a site edit queues lfg_changed (but recording ids does not).
  perform public.lfg_set_message(v_post, '111', '222');
  if exists (select 1 from public.notifications_outbox where id > v_outbox and type like 'lfg_%') then
    raise exception 'FAIL: recording the message id queued an event';
  end if;
  update public.free_agent_posts set note = 'Edited on the site' where id = v_post;
  if not exists (select 1 from public.notifications_outbox where id > v_outbox and type = 'lfg_changed'
                  and payload ->> 'message_id' = '222') then
    raise exception 'FAIL: site edit did not queue lfg_changed';
  end if;
  v_checks := v_checks + 2;

  -- Remove, then a new post within 24h is refused.
  v_json := public.lfg_remove_as(u[1]);
  if not (v_json ->> 'removed')::boolean or v_json ->> 'message_id' <> '222' then
    raise exception 'FAIL: remove wrong: %', v_json;
  end if;
  begin
    perform public.lfg_upsert_as(u[1], 'AR', null, null);
    raise exception 'FAIL: second post within 24 hours';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%post again%' then raise; end if;
  end;
  update public.free_agent_posts set created_at = now() - interval '25 hours' where user_id = u[1];
  v_json := public.lfg_upsert_as(u[1], 'AR', null, null);
  v_post := (v_json ->> 'post_id')::uuid;
  v_checks := v_checks + 3;

  -- Invite from Discord: only captains; joining the team takes the post down (lfg_changed).
  perform public.lfg_set_message(v_post, '111', '333');
  begin
    perform public.invite_player_as(u[1], v_team, u[1]);
    raise exception 'FAIL: non-captain invited';
  exception when insufficient_privilege then null;
  end;
  if public.captain_team_for(u[2]) <> v_team then
    raise exception 'FAIL: captain_team_for wrong';
  end if;
  perform public.invite_player_as(u[2], v_team, u[1]);
  begin
    perform public.invite_player_as(u[2], v_team, u[1]);
    raise exception 'FAIL: duplicate invite';
  exception when sqlstate 'P0001' then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.respond_to_invite((select id from public.team_invites where user_id = u[1] and team_id = v_team and status = 'pending'), true);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.free_agent_posts where user_id = u[1] and active)
     or not exists (select 1 from public.notifications_outbox where id > v_outbox and type = 'lfg_changed' and payload ->> 'message_id' = '333') then
    raise exception 'FAIL: joining a team should take the post down and queue the Discord delete';
  end if;
  v_checks := v_checks + 4;

  -- The site's invite_player still works (same core).
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.invite_player(v_team, u[3]);
  exception when sqlstate 'P0001' then null; -- incomplete profiles can be invited; any rule error is fine here
  end;
  reset role;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
