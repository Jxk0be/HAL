-- Free agent board, directory and Discord-name privacy tests.
-- Rolled back; expect: ERROR: ALL TESTS PASSED (n checks)
do $test$
declare
  v_cap uuid := gen_random_uuid();
  v_fa uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_season uuid;
  v_team uuid;
  v_post uuid;
  v_name text;
  v_checks int := 0;
  u uuid;
begin
  foreach u in array array[v_cap, v_fa, v_admin] loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (u, 'authenticated', 'authenticated', u || '@test.hal',
            jsonb_build_object('provider_id', 'd-' || u, 'full_name', 'fa' || left(u::text, 8)), now(), now());
  end loop;
  update public.profiles set activision_id = 'z' || left(id::text, 8) || '#7654321', platform = 'playstation',
                             age_confirmed_at = now(), controller_confirmed_at = now()
   where id in (v_cap, v_fa, v_admin);
  insert into public.staff_roles (user_id, role) values (v_admin, 'admin');

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('FA Test ' || gen_random_uuid(), 'signups') returning id into v_season;
  end if;
  update public.seasons set status = 'signups', roster_lock_at = null where id = v_season;
  insert into public.teams (season_id, name, tag, captain_id) values (v_season, 'FA Team ' || left(gen_random_uuid()::text, 6), 'FAT', v_cap)
  returning id into v_team;

  -- The free agent posts (SMG); the captain (on a team) cannot.
  perform set_config('request.jwt.claims', json_build_object('sub', v_fa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.free_agent_posts (user_id, season_id, platform, preferred_role, availability)
  values (v_fa, v_season, 'playstation', 'SMG', 'Weeknights') returning id into v_post;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.free_agent_posts (user_id, platform) values (v_cap, 'playstation');
    raise exception 'FAIL: rostered player posted as a free agent';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into public.free_agent_posts (user_id, platform, preferred_role) values (v_cap, 'playstation', 'Sniper');
    raise exception 'FAIL: unknown role accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- Signed in: names visible and searchable.
  select discord_username into v_name from public.free_agent_board(p_role => 'SMG') where id = v_fa;
  if v_name is null then raise exception 'FAIL: signed-in viewer did not get the Discord name'; end if;
  if not exists (select 1 from public.free_agent_board(p_search => 'fa' || left(v_fa::text, 8)) where id = v_fa) then
    raise exception 'FAIL: signed-in search by Discord name found nothing';
  end if;
  reset role;
  v_checks := v_checks + 4;

  -- Logged out: no Discord names anywhere, and they can't be searched.
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform discord_username from public.profiles limit 1;
    raise exception 'FAIL: anon read profiles.discord_username';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  if exists (select 1 from public.free_agent_board() where discord_username is not null)
     or exists (select 1 from public.player_directory() where discord_username is not null) then
    raise exception 'FAIL: anon got Discord names from the board or directory';
  end if;
  if exists (select 1 from public.free_agent_board(p_search => 'fa' || left(v_fa::text, 8)) where id = v_fa) then
    raise exception 'FAIL: anon searched by Discord name';
  end if;
  if not exists (select 1 from public.free_agent_board(p_search => 'z' || left(v_fa::text, 8)) where id = v_fa and preferred_role = 'SMG') then
    raise exception 'FAIL: anon could not find a free agent by Activision ID';
  end if;
  if not exists (select 1 from public.player_directory(p_player_id => v_cap) where team_id = v_team and is_captain) then
    raise exception 'FAIL: directory did not show the captain''s team';
  end if;
  if exists (select 1 from public.free_agent_board(p_search => '%')) then
    raise exception 'FAIL: a %% search was treated as a wildcard';
  end if;
  reset role;
  v_checks := v_checks + 6;

  -- Joining a team takes the post down and removes them from the board.
  perform set_config('request.jwt.claims', json_build_object('sub', v_cap, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.invite_player(v_team, v_fa);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_fa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.respond_to_invite((select id from public.team_invites where user_id = v_fa and status = 'pending'), true);
  reset role;
  if exists (select 1 from public.free_agent_posts where id = v_post and active)
     or exists (select 1 from public.free_agent_board() where id = v_fa) then
    raise exception 'FAIL: joining a team left the free agent post up';
  end if;
  v_checks := v_checks + 1;

  -- Staff can take down any post (and it is audit-logged).
  perform set_config('request.jwt.claims', '', true);
  update public.free_agent_posts set active = true where id = v_post; -- service role re-opens for the test
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.free_agent_posts set active = false where id = v_post;
  delete from public.free_agent_posts where id = v_post;
  reset role;
  if exists (select 1 from public.free_agent_posts where id = v_post)
     or not exists (select 1 from public.audit_log where table_name = 'free_agent_posts' and row_id = v_post::text and actor_id = v_admin and action = 'delete') then
    raise exception 'FAIL: staff post removal not applied or not audited';
  end if;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
