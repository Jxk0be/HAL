-- Admin team deletion tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
-- Players (captain included) become free agents; teams with matches are removed, not deleted.
do $test$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                    gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_admin uuid;
  v_season uuid;
  v_a uuid; v_b uuid; v_c uuid;
  v_json jsonb;
  v_checks int := 0;
  x uuid;
begin
  foreach x in array u loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'dt' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'dt' || left(id::text, 6) || '#1234567', platform = 'xbox',
                             age_confirmed_at = now(), controller_confirmed_at = now()
   where id = any (u);
  v_admin := u[7];
  insert into public.staff_roles (user_id, role) values (v_admin, 'admin'), (u[1], 'admin');

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('Delete ' || gen_random_uuid(), 'regular') returning id into v_season;
  end if;
  update public.seasons set status = 'signups', roster_lock_at = null where id = v_season;

  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Del A ' || left(gen_random_uuid()::text, 4), 'DTA', u[1], 'approved') returning id into v_a;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Del B ' || left(gen_random_uuid()::text, 4), 'DTB', u[3], 'approved') returning id into v_b;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Del C ' || left(gen_random_uuid()::text, 4), 'DTC', u[5], 'approved') returning id into v_c;
  insert into public.team_members (team_id, user_id, role) values (v_a, u[2], 'sub'), (v_b, u[4], 'sub'), (v_c, u[6], 'sub');
  update public.teams set co_captain_id = u[4] where id = v_b;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_b, v_c, now() + interval '1 day', now() + interval '1 day');
  -- In season with no roster changes left, so a normal drop would be refused.
  update public.seasons set status = 'regular', max_roster_changes = 0 where id = v_season;

  -- A player can't delete a team; an admin on the team is recused.
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_delete_team(v_a);
    raise exception 'FAIL: a player deleted a team';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_delete_team(v_a);
    raise exception 'FAIL: an admin deleted their own team';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 2;

  -- No matches: the team is deleted and both players (captain too) are free agents.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_json := public.admin_delete_team(v_a);
  reset role;
  if not (v_json->>'deleted')::boolean or (v_json->>'released')::int <> 2 then
    raise exception 'FAIL: unexpected result %', v_json;
  end if;
  if exists (select 1 from public.teams where id = v_a) then
    raise exception 'FAIL: team without matches still exists';
  end if;
  if (select count(*) from public.profiles where id in (u[1], u[2]) and is_free_agent) <> 2 then
    raise exception 'FAIL: deleted team''s players are not free agents';
  end if;
  if not exists (select 1 from net.http_request_queue q
                  where convert_from(q.body, 'utf8')::jsonb @> jsonb_build_object('action', 'team_removed', 'team_id', v_a)) then
    raise exception 'FAIL: Discord cleanup not queued for the deleted team';
  end if;
  v_checks := v_checks + 3;

  -- With matches: removed instead, roster emptied, no roster change used, players free agents.
  set local role authenticated;
  v_json := public.admin_delete_team(v_b);
  reset role;
  if (v_json->>'deleted')::boolean or (v_json->>'released')::int <> 2 then
    raise exception 'FAIL: unexpected result for team with matches %', v_json;
  end if;
  if not exists (select 1 from public.teams where id = v_b and status = 'removed' and co_captain_id is null and roster_changes_used = 0) then
    raise exception 'FAIL: team with matches not marked removed cleanly';
  end if;
  if exists (select 1 from public.team_members where team_id = v_b and left_at is null) then
    raise exception 'FAIL: removed team still has active players';
  end if;
  if (select count(*) from public.profiles where id in (u[3], u[4]) and is_free_agent) <> 2 then
    raise exception 'FAIL: removed team''s players are not free agents';
  end if;
  if not exists (select 1 from public.matches where home_team_id = v_b) then
    raise exception 'FAIL: match history lost';
  end if;
  v_checks := v_checks + 4;

  -- Released players can join another team right away (no 7-day same-division wait).
  update public.seasons set max_roster_changes = 5 where id = v_season;
  insert into public.team_members (team_id, user_id, role) values (v_c, u[4], 'sub');
  if (select is_free_agent from public.profiles where id = u[4]) then
    raise exception 'FAIL: player still a free agent after joining a new team';
  end if;
  v_checks := v_checks + 1;

  -- Normal drops still can't remove a captain.
  perform set_config('request.jwt.claims', '', true);
  begin
    update public.team_members set left_at = now() where team_id = v_c and user_id = u[5];
    raise exception 'FAIL: captain dropped outside a team deletion';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
