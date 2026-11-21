-- Emergency sub consent tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
-- Captain requests → the free agent accepts or declines → only then can an admin approve.
do $test$
declare
  a uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];  -- team A: only 3 players
  b uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_fa uuid := gen_random_uuid();     -- free agent who accepts
  v_fa2 uuid := gen_random_uuid();    -- free agent who declines
  v_admin uuid := gen_random_uuid();
  v_season uuid;
  v_ta uuid; v_tb uuid; v_match uuid;
  v_req uuid; v_req2 uuid;
  v_checks int := 0;
  x uuid;
begin
  foreach x in array a || b || array[v_fa, v_fa2, v_admin] loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'es' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'es' || left(id::text, 6) || '#1234567', platform = 'xbox',
                             age_confirmed_at = now(), controller_confirmed_at = now()
   where id = any (a || b || array[v_fa, v_fa2, v_admin]);
  insert into public.staff_roles (user_id, role) values (v_admin, 'admin');

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('ES ' || gen_random_uuid(), 'signups') returning id into v_season;
  end if;
  update public.seasons set status = 'signups', roster_lock_at = null where id = v_season;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'ES A ' || left(gen_random_uuid()::text, 4), 'ESA', a[1], 'approved') returning id into v_ta;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'ES B ' || left(gen_random_uuid()::text, 4), 'ESB', b[1], 'approved') returning id into v_tb;
  insert into public.team_members (team_id, user_id) values (v_ta, a[2]), (v_ta, a[3]), (v_tb, b[2]), (v_tb, b[3]), (v_tb, b[4]);
  update public.team_members set joined_at = now() - interval '3 days' where team_id in (v_ta, v_tb);
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_ta, v_tb, now() + interval '1 day', now() + interval '1 day') returning id into v_match;

  -- A full team can't request; the short team's captain can.
  perform set_config('request.jwt.claims', json_build_object('sub', b[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.roster_requests (team_id, user_id, type, match_id) values (v_tb, v_fa, 'emergency_sub', v_match);
    raise exception 'FAIL: full team requested an emergency sub';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.roster_requests (team_id, user_id, type, match_id, note) values (v_ta, v_fa, 'emergency_sub', v_match, 'Our 4th is sick') returning id into v_req;
  insert into public.roster_requests (team_id, user_id, type, match_id) values (v_ta, v_fa2, 'emergency_sub', v_match) returning id into v_req2;
  begin
    insert into public.roster_requests (team_id, user_id, type, match_id) values (v_ta, v_fa, 'emergency_sub', v_match);
    raise exception 'FAIL: duplicate request allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into public.roster_requests (team_id, user_id, type, match_id) values (v_ta, b[2], 'emergency_sub', v_match);
    raise exception 'FAIL: rostered player requested as emergency sub';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  if not exists (select 1 from public.notifications_outbox where type = 'emergency_sub_requested' and payload->>'request_id' = v_req::text) then
    raise exception 'FAIL: no DM queued for the request';
  end if;
  v_checks := v_checks + 4;

  -- Admin can't approve before the player accepts; the captain can't accept for them.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.roster_requests set status = 'approved' where id = v_req;
    raise exception 'FAIL: approved before the player accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.respond_emergency_sub(v_req, true);
    raise exception 'FAIL: captain accepted for the player';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 2;

  -- The player accepts (site); the other declines (bot path).
  perform set_config('request.jwt.claims', json_build_object('sub', v_fa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.respond_emergency_sub(v_req, true);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform public.respond_emergency_sub_as(v_fa2, v_req2, false);
  if not exists (select 1 from public.roster_requests where id = v_req and player_confirmed_at is not null and status = 'pending')
     or not exists (select 1 from public.notifications_outbox where type = 'emergency_sub_accepted' and payload->>'request_id' = v_req::text) then
    raise exception 'FAIL: accept not recorded or staff not notified';
  end if;
  if not exists (select 1 from public.roster_requests where id = v_req2 and status = 'denied' and player_declined_at is not null and reviewed_by is null)
     or not exists (select 1 from public.notifications_outbox where type = 'emergency_sub_declined' and payload->>'request_id' = v_req2::text) then
    raise exception 'FAIL: decline not recorded or captain not notified';
  end if;
  v_checks := v_checks + 2;

  -- Now the admin approves: one-match spot, still a free agent, captain notified.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.roster_requests set status = 'approved' where id = v_req;
  reset role;
  if not exists (select 1 from public.team_members where team_id = v_ta and user_id = v_fa and is_emergency and emergency_match_id = v_match)
     or not (select is_free_agent from public.profiles where id = v_fa)
     or not exists (select 1 from public.notifications_outbox where type = 'emergency_sub_reviewed' and payload->>'request_id' = v_req::text) then
    raise exception 'FAIL: approval did not add a one-match spot, keep free agent status, or notify';
  end if;
  v_checks := v_checks + 1;

  -- Nobody but the player can touch the answer columns directly.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.roster_requests set player_declined_at = now() where id = v_req;
    if found then raise exception 'FAIL: admin changed the player answer'; end if;
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
