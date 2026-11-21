-- Captain disband tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
-- Only the captain can disband; players (captain included) become free agents; it's audit-logged.
do $test$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                    gen_random_uuid(), gen_random_uuid()];
  v_season uuid;
  v_a uuid; v_b uuid; v_c uuid;
  v_json jsonb;
  v_checks int := 0;
  x uuid;
begin
  foreach x in array u loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'db' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'db' || left(id::text, 6) || '#1234567', platform = 'xbox',
                             age_confirmed_at = now(), controller_confirmed_at = now()
   where id = any (u);

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('Disband ' || gen_random_uuid(), 'signups') returning id into v_season;
  end if;
  update public.seasons set status = 'signups', roster_lock_at = null where id = v_season;

  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Dis A ' || left(gen_random_uuid()::text, 4), 'DBA', u[1], 'approved') returning id into v_a;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Dis B ' || left(gen_random_uuid()::text, 4), 'DBB', u[3], 'approved') returning id into v_b;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Dis C ' || left(gen_random_uuid()::text, 4), 'DBC', u[5], 'approved') returning id into v_c;
  insert into public.team_members (team_id, user_id, role) values (v_a, u[2], 'sub'), (v_b, u[4], 'sub'), (v_c, u[6], 'sub');
  update public.teams set co_captain_id = u[2] where id = v_a;
  update public.teams set co_captain_id = u[4] where id = v_b;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_b, v_c, now() + interval '1 day', now() + interval '1 day');
  -- In season with no roster changes left: disbanding must still work.
  update public.seasons set status = 'regular', max_roster_changes = 0 where id = v_season;

  -- The co-captain and other teams' captains can't disband it.
  foreach x in array array[u[2], u[5]] loop
    perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.disband_team(v_a);
      raise exception 'FAIL: % disbanded a team they do not captain', x;
    exception when others then
      if sqlerrm like 'FAIL%' then raise; end if;
    end;
    reset role;
  end loop;
  v_checks := v_checks + 1;

  -- Captain, no matches: deleted, both players free agents, audit entry written.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_json := public.disband_team(v_a);
  reset role;
  if not (v_json->>'deleted')::boolean or (v_json->>'released')::int <> 2
     or exists (select 1 from public.teams where id = v_a) then
    raise exception 'FAIL: team without matches not deleted %', v_json;
  end if;
  if (select count(*) from public.profiles where id in (u[1], u[2]) and is_free_agent) <> 2 then
    raise exception 'FAIL: disbanded team''s players are not free agents';
  end if;
  if not exists (select 1 from public.audit_log where row_id = v_a::text and action = 'disbanded' and actor_id = u[1]) then
    raise exception 'FAIL: disband not audit-logged';
  end if;
  v_checks := v_checks + 3;

  -- Captain, with matches: removed, roster emptied, players free agents, matches kept.
  perform set_config('request.jwt.claims', json_build_object('sub', u[3], 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_json := public.disband_team(v_b);
  reset role;
  if (v_json->>'deleted')::boolean
     or not exists (select 1 from public.teams where id = v_b and status = 'removed' and co_captain_id is null)
     or exists (select 1 from public.team_members where team_id = v_b and left_at is null) then
    raise exception 'FAIL: team with matches not removed cleanly %', v_json;
  end if;
  if (select count(*) from public.profiles where id in (u[3], u[4]) and is_free_agent) <> 2 then
    raise exception 'FAIL: removed team''s players are not free agents';
  end if;
  if not exists (select 1 from public.matches where home_team_id = v_b) then
    raise exception 'FAIL: match history lost';
  end if;
  v_checks := v_checks + 3;

  -- A removed team can't be disbanded again, and the core function isn't callable directly.
  set local role authenticated;
  begin
    perform public.disband_team(v_b);
    raise exception 'FAIL: removed team disbanded twice';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.delete_team_core(v_c);
    raise exception 'FAIL: delete_team_core callable by a user';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  if not exists (select 1 from public.teams where id = v_c and status = 'approved') then
    raise exception 'FAIL: another team was affected';
  end if;
  v_checks := v_checks + 2;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
