-- Team management tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
-- Captain transfer, co-captain rules, and signups-only team creation.
do $test$
declare
  v_cap uuid := gen_random_uuid();
  v_co uuid := gen_random_uuid();
  v_p uuid := gen_random_uuid();
  v_late uuid := gen_random_uuid();
  v_season uuid;
  v_team uuid;
  v_checks int := 0;
  u uuid;
begin
  foreach u in array array[v_cap, v_co, v_p, v_late] loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (u, 'authenticated', 'authenticated', u || '@test.hal',
            jsonb_build_object('provider_id', 'd-' || u, 'full_name', 'user ' || left(u::text, 8)), now(), now());
  end loop;
  update public.profiles set activision_id = 'p' || left(id::text, 8) || '#1234567', platform = 'xbox',
                             age_confirmed_at = now(), controller_confirmed_at = now()
   where id in (v_cap, v_co, v_p, v_late);

  -- Reuse the active season if there is one (only one may exist); force signups for this test.
  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('TM Test ' || gen_random_uuid(), 'signups') returning id into v_season;
  end if;
  update public.seasons set status = 'signups', roster_lock_at = null where id = v_season;

  -- A player creates a team during signups and becomes captain + first starter.
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.teams (season_id, name, tag, captain_id) values (v_season, 'Mgmt ' || left(gen_random_uuid()::text, 6), 'MGT', v_cap)
  returning id into v_team;
  reset role;
  if not exists (select 1 from public.team_members where team_id = v_team and user_id = v_cap and role = 'starter') then
    raise exception 'FAIL: creator is not the first starter';
  end if;
  insert into public.team_members (team_id, user_id) values (v_team, v_co), (v_team, v_p);
  v_checks := v_checks + 1;

  -- Captain sets a co-captain; the co-captain can't change it.
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.teams set co_captain_id = v_co where id = v_team;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_co, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.teams set co_captain_id = v_p where id = v_team;
    raise exception 'FAIL: co-captain changed the co-captain';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.transfer_captaincy(v_team, v_co);
    raise exception 'FAIL: co-captain took the captaincy';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 2;

  -- Captain hands over to the co-captain: co-captain slot clears, old captain stays rostered.
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.transfer_captaincy(v_team, v_late);
    raise exception 'FAIL: captaincy given to someone off the roster';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform public.transfer_captaincy(v_team, v_co);
  reset role;
  if not exists (select 1 from public.teams where id = v_team and captain_id = v_co and co_captain_id is null)
     or not exists (select 1 from public.team_members where team_id = v_team and user_id = v_cap and left_at is null) then
    raise exception 'FAIL: captaincy transfer did not update the team correctly';
  end if;
  -- The old captain can now leave.
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.leave_team(v_team);
  reset role;
  v_checks := v_checks + 3;

  -- No new teams once the season leaves signups.
  perform set_config('request.jwt.claims', '', true);
  update public.seasons set status = 'regular' where id = v_season;
  perform set_config('request.jwt.claims', json_build_object('sub', v_late, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.teams (season_id, name, tag, captain_id) values (v_season, 'Late ' || left(gen_random_uuid()::text, 6), 'LATE', v_late);
    raise exception 'FAIL: team created after signups closed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like '%only open during signups%' and sqlerrm not like '%registration is closed%' then
      raise exception 'FAIL: unexpected error for late team: %', sqlerrm;
    end if;
  end;
  reset role;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
