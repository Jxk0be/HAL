-- Broadcast tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
do $test$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_caster uuid; v_caster2 uuid;
  v_season uuid;
  v_a uuid; v_b uuid;
  v_m uuid; v_m2 uuid;
  v_outbox bigint;
  x uuid;
  v_checks int := 0;
begin
  foreach x in array u loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'bc' || left(x::text, 6)), now(), now());
  end loop;
  v_caster := u[3];
  v_caster2 := u[4];
  insert into public.staff_roles (user_id, role) values (v_caster, 'caster'), (v_caster2, 'caster');

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('Cast ' || gen_random_uuid(), 'regular') returning id into v_season;
  end if;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Alpha ' || left(gen_random_uuid()::text, 4), 'BCA', u[1], 'approved') returning id into v_a;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Bravo ' || left(gen_random_uuid()::text, 4), 'BCB', u[2], 'approved') returning id into v_b;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_a, v_b, now() + interval '1 hour', now() + interval '1 hour') returning id into v_m;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 2, v_a, v_b, now() + interval '1 day', now() + interval '1 day') returning id into v_m2;
  select coalesce(max(id), 0) into v_outbox from public.notifications_outbox;

  perform set_config('request.jwt.claims', json_build_object('sub', v_caster, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Link validation.
  begin
    perform public.set_broadcast(v_m, true, 'http://twitch.tv/caster');
    raise exception 'FAIL: http link accepted';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.set_broadcast(v_m, true, 'https://evil.example/twitch.tv');
    raise exception 'FAIL: non-stream host accepted';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.set_broadcast(v_m, true, 'https://twitch.tv.evil.com/x');
    raise exception 'FAIL: look-alike host accepted';
  exception when sqlstate 'P0001' then null;
  end;
  v_checks := v_checks + 3;

  -- Claim, then go live; another caster can't take it.
  perform public.claim_broadcast(v_m2, true);
  perform public.set_broadcast(v_m, true, 'https://www.twitch.tv/halcaster');
  if not exists (select 1 from public.live_broadcasts() where match_id = v_m and url = 'https://www.twitch.tv/halcaster') then
    raise exception 'FAIL: live broadcast not listed';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_caster2, 'role', 'authenticated')::text, true);
  begin
    perform public.claim_broadcast(v_m2, true);
    raise exception 'FAIL: claimed a match another caster has';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.set_broadcast(v_m, false);
    raise exception 'FAIL: ended another caster''s broadcast';
  exception when sqlstate 'P0001' then null;
  end;
  v_checks := v_checks + 3;

  -- Casters can't change anything else.
  update public.matches set home_series = 3, away_series = 0, status = 'confirmed' where id = v_m;
  if found then raise exception 'FAIL: caster updated a match directly'; end if;
  begin
    perform public.admin_set_result(v_m, '[]'::jsonb);
    raise exception 'FAIL: caster set a result';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_forfeit(v_m, v_a);
    raise exception 'FAIL: caster set a forfeit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_overview();
    raise exception 'FAIL: caster read the admin overview';
  exception when insufficient_privilege then null;
  end;
  v_checks := v_checks + 4;

  -- End keeps the link as the VOD.
  perform set_config('request.jwt.claims', json_build_object('sub', v_caster, 'role', 'authenticated')::text, true);
  perform public.set_broadcast(v_m, false);
  reset role;
  if not exists (select 1 from public.matches where id = v_m and not broadcast_live and broadcast_url = 'https://www.twitch.tv/halcaster' and broadcast_by = v_caster)
     or exists (select 1 from public.live_broadcasts() where match_id = v_m) then
    raise exception 'FAIL: ending should keep the link and leave the live list';
  end if;
  if (select status from public.matches where id = v_m) <> 'scheduled' then
    raise exception 'FAIL: caster changed the match status';
  end if;
  v_checks := v_checks + 2;

  -- Players on a team can't go live, and anon can read the live list.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.set_broadcast(v_m2, true, 'https://kick.com/someone');
    raise exception 'FAIL: player went live';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  perform * from public.live_broadcasts();
  reset role;
  v_checks := v_checks + 2;

  -- Outbox and audit log.
  if (select array_agg(type order by id) from public.notifications_outbox where id > v_outbox) <> array['broadcast_live', 'broadcast_ended'] then
    raise exception 'FAIL: outbox wrong';
  end if;
  if not exists (select 1 from public.audit_log where actor_id = v_caster and actor_role = 'caster' and table_name = 'matches') then
    raise exception 'FAIL: caster actions not audited';
  end if;
  v_checks := v_checks + 2;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
