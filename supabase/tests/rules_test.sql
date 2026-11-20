-- HAL rule tests. Proves the free agent / invite flow, roster limits, recusal and caster rules
-- hold in Postgres.
--
-- Run against any HAL database (local or remote). Everything happens in one DO block that ends by
-- raising 'ALL TESTS PASSED', so every row it creates is rolled back. Any other error is a failure.
--   Remote: paste into the SQL editor (or the Supabase MCP execute_sql).
--   Local:  psql "$DB_URL" -f supabase/tests/rules_test.sql
--
-- Expected output: ERROR: ALL TESTS PASSED (n checks)

do $test$
declare
  v_owner uuid := gen_random_uuid();
  v_admin_on_a uuid := gen_random_uuid();   -- admin who plays on team A
  v_admin uuid := gen_random_uuid();        -- neutral admin
  v_caster uuid := gen_random_uuid();
  v_cap_a uuid := gen_random_uuid();
  v_cap_b uuid := gen_random_uuid();
  v_p uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                      gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_season uuid;
  v_team_a uuid;
  v_team_b uuid;
  v_match uuid;
  v_mode uuid;
  v_map uuid;
  v_inv_a uuid;
  v_inv_b uuid;
  v_rows int;
  v_checks int := 0;
  u uuid;
begin
  -- -------------------------------------------------------------------------
  -- Setup (as the database owner: auth.uid() is null, so triggers treat it as the service role)
  -- -------------------------------------------------------------------------
  foreach u in array array[v_owner, v_admin_on_a, v_admin, v_caster, v_cap_a, v_cap_b] || v_p loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (u, 'authenticated', 'authenticated', u || '@test.hal',
            jsonb_build_object('provider_id', 'd-' || u, 'full_name', 'user ' || left(u::text, 8)),
            now(), now());
  end loop;
  -- Everyone onboarded except p6 (no controller confirmation yet).
  update public.profiles set activision_id = 'p' || left(id::text, 8) || '#1234567', age_confirmed_at = now(),
                             controller_confirmed_at = now(), platform = 'playstation'
   where id = any (array[v_owner, v_admin_on_a, v_admin, v_caster, v_cap_a, v_cap_b] || v_p);
  update public.profiles set controller_confirmed_at = null where id = v_p[6];

  -- 1. Signing up makes you a free agent.
  if (select count(*) from public.profiles
       where id = any (array[v_cap_a] || v_p) and discord_id = 'd-' || id and is_free_agent) <> 7 then
    raise exception 'FAIL: new profiles were not auto-created as free agents';
  end if;
  v_checks := v_checks + 1;

  insert into public.staff_roles (user_id, role) values
    (v_owner, 'owner'), (v_admin_on_a, 'admin'), (v_admin, 'admin'), (v_caster, 'caster');

  insert into public.seasons (name, status) values ('Test Season ' || gen_random_uuid(), 'signups')
  returning id into v_season;

  insert into public.teams (season_id, name, tag, captain_id, status)
  values (v_season, 'Alpha ' || left(gen_random_uuid()::text, 6), 'ALP', v_cap_a, 'approved')
  returning id into v_team_a;
  insert into public.teams (season_id, name, tag, captain_id, status)
  values (v_season, 'Bravo ' || left(gen_random_uuid()::text, 6), 'BRV', v_cap_b, 'approved')
  returning id into v_team_b;

  -- Team A: captain (auto, starter) + admin + p1 + p2 starters = 4 starters; p3, p4 subs. 6 total.
  insert into public.team_members (team_id, user_id, role, joined_at)
  select v_team_a, x, 'starter', now() - interval '3 days'
    from unnest(array[v_admin_on_a, v_p[1], v_p[2]]) x;
  insert into public.team_members (team_id, user_id, role, joined_at)
  select v_team_a, x, 'sub', now() - interval '3 days'
    from unnest(array[v_p[3], v_p[4]]) x;

  -- Joining a team takes you off the free agent list.
  if exists (select 1 from public.free_agents where id in (v_cap_a, v_p[1]))
     or not exists (select 1 from public.free_agents where id = v_p[5]) then
    raise exception 'FAIL: free agent list out of step with rosters';
  end if;
  v_checks := v_checks + 1;

  -- A 5th starter is refused even for the service role.
  begin
    insert into public.team_members (team_id, user_id, role) values (v_team_a, v_p[6], 'starter');
    raise exception 'FAIL: 5th starter inserted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like 'Starter spots are full%' then raise exception 'FAIL: unexpected error for 5th starter: %', sqlerrm; end if;
  end;
  v_checks := v_checks + 1;

  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_team_a, v_team_b, now() + interval '3 days', now() + interval '3 days')
  returning id into v_match;
  insert into public.game_modes (name) values ('Test Mode ' || gen_random_uuid()) returning id into v_mode;
  insert into public.maps (name) values ('Test Map ' || gen_random_uuid()) returning id into v_map;

  -- -------------------------------------------------------------------------
  -- 2. Invites: captain invites, player accepts, no admin approval
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_inv_a := public.invite_player(v_team_a, v_p[5]);
  begin
    insert into public.team_members (team_id, user_id) values (v_team_a, v_p[6]);
    raise exception 'FAIL: captain inserted a roster entry directly';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;   -- RLS: players join only by accepting an invite
  end;
  begin
    insert into public.roster_requests (team_id, user_id, type) values (v_team_a, v_p[6], 'add');
    raise exception 'FAIL: roster add request accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.invite_player(v_team_a, v_p[5]);
    raise exception 'FAIL: duplicate invite allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 3;

  perform set_config('request.jwt.claims', json_build_object('sub', v_cap_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_inv_b := public.invite_player(v_team_b, v_p[5]);
  reset role;

  -- An invite alone doesn't put anyone on a roster.
  if exists (select 1 from public.team_members where user_id = v_p[5]) then
    raise exception 'FAIL: invited player joined without accepting';
  end if;
  v_checks := v_checks + 1;

  -- Only the invited player can answer.
  perform set_config('request.jwt.claims', json_build_object('sub', v_p[6], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.respond_to_invite(v_inv_a, true);
    raise exception 'FAIL: someone else accepted an invite';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.invite_player(v_team_a, v_p[6]);
    raise exception 'FAIL: non-captain sent an invite';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 2;

  perform set_config('request.jwt.claims', json_build_object('sub', v_p[5], 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.respond_to_invite(v_inv_a, true);
  -- Accepting one invite voids the other team's invite (one team per season).
  begin
    perform public.respond_to_invite(v_inv_b, true);
    raise exception 'FAIL: player accepted a second team''s invite';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like 'This invite is no longer open%' then raise exception 'FAIL: unexpected error on second invite: %', sqlerrm; end if;
  end;
  reset role;
  if not exists (
    select 1 from public.team_members
     where team_id = v_team_a and user_id = v_p[5] and role = 'sub' and left_at is null
  ) or (select is_free_agent from public.profiles where id = v_p[5]) then
    raise exception 'FAIL: accepted invite did not add the player as a sub (starters were full)';
  end if;
  if (select status from public.team_invites where id = v_inv_b) <> 'cancelled' then
    raise exception 'FAIL: other team''s invite was not cancelled';
  end if;
  v_checks := v_checks + 3;

  -- -------------------------------------------------------------------------
  -- 3. Roster limits: 4 starters + 3 subs; no 8th player; one team per season
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.invite_player(v_team_a, v_p[6]);
    raise exception 'FAIL: captain invited an 8th player';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like 'Your roster is full%' then raise exception 'FAIL: unexpected error for 8th invite: %', sqlerrm; end if;
  end;
  begin
    update public.team_members set role = 'starter' where team_id = v_team_a and user_id = v_p[3];
    raise exception 'FAIL: captain promoted a 5th starter';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like 'Starter spots are full%' then raise exception 'FAIL: unexpected error for 5th starter: %', sqlerrm; end if;
  end;
  reset role;
  begin
    insert into public.team_members (team_id, user_id, role) values (v_team_a, v_p[6], 'sub');
    raise exception 'FAIL: 8th player inserted by service role';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like 'Roster is full%' then raise exception 'FAIL: unexpected error for 8th player insert: %', sqlerrm; end if;
  end;
  begin
    insert into public.team_members (team_id, user_id) values (v_team_b, v_p[1]);
    raise exception 'FAIL: player joined a second team';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like 'This player is already on a team this season%' then
      raise exception 'FAIL: unexpected error for second team: %', sqlerrm;
    end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.invite_player(v_team_b, v_p[1]);
    raise exception 'FAIL: captain invited a player who is on another team';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like 'This player is already on a team this season%' then
      raise exception 'FAIL: unexpected error for second-team invite: %', sqlerrm;
    end if;
  end;
  reset role;
  v_checks := v_checks + 5;

  -- Captain removes a player -> they are a free agent again and the spot reopens.
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.remove_player(v_team_a, v_p[4]);
  perform public.invite_player(v_team_a, v_p[6]);
  begin
    perform public.remove_player(v_team_a, v_cap_a);
    raise exception 'FAIL: captain removed themselves';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  if not (select is_free_agent from public.profiles where id = v_p[4]) then
    raise exception 'FAIL: removed player is not a free agent again';
  end if;
  v_checks := v_checks + 3;

  -- -------------------------------------------------------------------------
  -- Onboarding: an incomplete profile can't join; confirmations are set-once
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_p[6], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.respond_to_invite(
      (select id from public.team_invites where user_id = v_p[6] and status = 'pending'), true);
    raise exception 'FAIL: incomplete profile joined a team';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like 'Finish your profile%' then raise exception 'FAIL: unexpected error for incomplete join: %', sqlerrm; end if;
  end;
  -- Completing onboarding: the server stamps the time, whatever the client sends.
  update public.profiles set controller_confirmed_at = '2000-01-01' where id = v_p[6];
  if (select controller_confirmed_at < now() - interval '1 minute' from public.profiles where id = v_p[6]) then
    raise exception 'FAIL: client chose its own confirmation timestamp';
  end if;
  begin
    update public.profiles set age_confirmed_at = null where id = v_p[6];
    raise exception 'FAIL: age confirmation withdrawn';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    update public.profiles set banned_until = null where id = v_p[6];
    update public.profiles set banned_until = now() - interval '1 day' where id = v_p[6];
    raise exception 'FAIL: player edited their own ban';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    update public.profiles set activision_id = 'no-hash-here' where id = v_p[6];
    raise exception 'FAIL: bad Activision ID accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    update public.profiles
       set activision_id = upper((select activision_id from public.profiles where id = v_p[1]))
     where id = v_p[6];
    raise exception 'FAIL: duplicate Activision ID accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_p[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set is_free_agent = false where id = v_p[1];
  begin
    update public.profiles set is_free_agent = true where id = v_p[1];
    raise exception 'FAIL: rostered player listed themselves as a free agent';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    update public.profiles set platform = 'xbox' where id = v_p[2];
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then raise exception 'FAIL: player edited someone else''s profile'; end if;
  end;
  reset role;
  v_checks := v_checks + 8;

  -- A player can leave on their own.
  perform set_config('request.jwt.claims', json_build_object('sub', v_p[3], 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.leave_team(v_team_a);
  reset role;
  if exists (select 1 from public.team_members where user_id = v_p[3] and left_at is null) then
    raise exception 'FAIL: leave_team did not remove the player';
  end if;
  v_checks := v_checks + 1;

  -- -------------------------------------------------------------------------
  -- 4. An admin rostered on a team can't take staff actions on that team's match
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_on_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.matches set status = 'confirmed', home_series = 3, away_series = 0 where id = v_match;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL: rostered admin edited their own match'; end if;
  begin
    insert into public.match_maps (match_id, map_number, mode_id, map_id, home_score, away_score)
    values (v_match, 1, v_mode, v_map, 250, 100);
    raise exception 'FAIL: rostered admin added a map result to their own match';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.set_broadcast(v_match, true, 'https://twitch.tv/hal');
    raise exception 'FAIL: rostered admin set a broadcast on their own match';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
    values (v_season, 2, v_team_a, v_team_b, now() + interval '10 days', now() + interval '10 days');
    raise exception 'FAIL: rostered admin created a match for their own team';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 4;

  -- ...while a neutral admin can.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.matches set week = 2 where id = v_match;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FAIL: neutral admin could not edit the match'; end if;
  insert into public.match_maps (match_id, map_number, mode_id, map_id, home_score, away_score)
  values (v_match, 1, v_mode, v_map, 250, 100);
  reset role;
  v_checks := v_checks + 2;

  -- The owner is recused too once they join a team.
  insert into public.team_members (team_id, user_id) values (v_team_b, v_owner);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.matches set week = 3 where id = v_match;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL: rostered owner edited their own match'; end if;
  reset role;
  v_checks := v_checks + 1;

  -- -------------------------------------------------------------------------
  -- 5. A caster can only toggle broadcast fields
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_caster, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.matches set status = 'cancelled' where id = v_match;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL: caster changed a match status'; end if;
  update public.matches set broadcast_live = true, broadcast_url = 'https://twitch.tv/x' where id = v_match;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL: caster updated broadcast columns directly'; end if;
  perform public.set_broadcast(v_match, true, 'https://twitch.tv/hal');
  begin
    perform public.set_broadcast(v_match, true, 'javascript:alert(1)');
    raise exception 'FAIL: caster set a non-https stream link';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into public.match_maps (match_id, map_number, mode_id, map_id) values (v_match, 2, v_mode, v_map);
    raise exception 'FAIL: caster wrote a match map';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  if not exists (
    select 1 from public.matches
     where id = v_match and broadcast_live and broadcast_url = 'https://twitch.tv/hal'
       and broadcast_by = v_caster and status = 'scheduled'
  ) then
    raise exception 'FAIL: set_broadcast did not set exactly the broadcast fields';
  end if;
  if not exists (
    select 1 from public.audit_log
     where table_name = 'matches' and row_id = v_match::text and actor_id = v_caster
       and actor_role = 'caster' and (new_data ->> 'broadcast_live')::boolean
  ) then
    raise exception 'FAIL: set_broadcast was not audited';
  end if;
  v_checks := v_checks + 6;

  perform set_config('request.jwt.claims', json_build_object('sub', v_p[2], 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.set_broadcast(v_match, false);
    raise exception 'FAIL: player set a broadcast';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 1;

  -- -------------------------------------------------------------------------
  -- 6. Private columns stay private; public lists work for visitors
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform discord_id from public.profiles limit 1;
    raise exception 'FAIL: anon read profiles.discord_id';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform discord_thread_id from public.disputes limit 1;
    raise exception 'FAIL: anon read disputes.discord_thread_id';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    if exists (select 1 from public.team_invites) then
      raise exception 'FAIL: anon read team invites';
    end if;
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform 1 from public.profiles_public limit 1;
  if not exists (select 1 from public.free_agents where id = v_p[4]) then
    raise exception 'FAIL: visitors cannot see the free agent list';
  end if;
  reset role;
  v_checks := v_checks + 5;

  -- -------------------------------------------------------------------------
  -- 7. Audit log
  -- -------------------------------------------------------------------------
  -- The neutral admin's edit (week 1 -> 2) is logged with only the changed column.
  if not exists (
    select 1 from public.audit_log
     where table_name = 'matches' and row_id = v_match::text and action = 'update'
       and actor_id = v_admin and actor_role = 'admin'
       and old_data = '{"week": 1}'::jsonb and new_data = '{"week": 2}'::jsonb
  ) then
    raise exception 'FAIL: admin match edit not logged with old and new values';
  end if;
  -- Captain/player actions are not logged: the invite, the accept (roster add), leaving.
  if exists (
    select 1 from public.audit_log
     where (table_name = 'team_members' and new_data ->> 'user_id' = v_p[5]::text)
        or (table_name = 'team_invites' and actor_id = v_cap_a)
        or actor_id in (v_cap_a, v_p[3], v_p[5])
  ) then
    raise exception 'FAIL: a captain/player roster action was audit-logged';
  end if;
  -- Private fields never reach the log.
  if exists (
    select 1 from public.audit_log
     where coalesce(new_data, '{}'::jsonb) ? 'discord_id' or coalesce(old_data, '{}'::jsonb) ? 'discord_id'
        or coalesce(new_data, '{}'::jsonb) ? 'discord_thread_id'
  ) then
    raise exception 'FAIL: private field stored in the audit log';
  end if;
  v_checks := v_checks + 3;

  -- Append-only for every role.
  begin
    delete from public.audit_log;
    raise exception 'FAIL: database owner deleted audit rows';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    update public.audit_log set action = 'x';
    raise exception 'FAIL: database owner updated audit rows';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  foreach u in array array[v_owner, v_admin] loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      delete from public.audit_log;
      raise exception 'FAIL: staff deleted audit rows';
    exception when others then
      if sqlerrm like 'FAIL%' then raise; end if;
    end;
    reset role;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  set local role service_role;
  begin
    delete from public.audit_log;
    raise exception 'FAIL: service role deleted audit rows';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 5;

  -- Visitors read the readable public feed, not the raw table.
  set local role anon;
  if not exists (
    select 1 from public.audit_log_public
     where row_id = v_match::text and actor_role = 'admin'
       and summary like 'Admin user % changed match ALP vs BRV (week 2): week 1 → 2'
  ) then
    raise exception 'FAIL: public audit feed missing a readable summary';
  end if;
  begin
    perform 1 from public.audit_log limit 1;
    raise exception 'FAIL: anon read the raw audit log';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  reset role;
  v_checks := v_checks + 2;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
