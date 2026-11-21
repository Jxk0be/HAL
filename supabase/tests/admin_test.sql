-- Admin panel tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).

create or replace function pg_temp.rep(
  p_match uuid, p_folder_team uuid, p_home uuid, p_away uuid, p_hp uuid[], p_ap uuid[],
  p_scores int[], p_mode uuid, p_map uuid, p_bump_map int default 0, p_bump_user uuid default null
) returns jsonb language plpgsql as $$
declare
  v_maps jsonb := '[]';
  v_players jsonb;
  n int;
  i int;
begin
  for n in 1 .. array_length(p_scores, 1) / 2 loop
    v_players := '[]';
    for i in 1 .. 4 loop
      v_players := v_players
        || jsonb_build_object('user_id', p_hp[i], 'team_id', p_home,
             'kills', 10 + i + n + case when n = p_bump_map and p_hp[i] = p_bump_user then 1 else 0 end,
             'deaths', 8 + i, 'score', 1000 * i)
        || jsonb_build_object('user_id', p_ap[i], 'team_id', p_away,
             'kills', 9 + i + n + case when n = p_bump_map and p_ap[i] = p_bump_user then 1 else 0 end,
             'deaths', 7 + i, 'score', 900 * i);
    end loop;
    v_maps := v_maps || jsonb_build_object(
      'number', n, 'mode_id', p_mode, 'map_id', p_map,
      'home_score', p_scores[2 * n - 1], 'away_score', p_scores[2 * n],
      'screenshots', jsonb_build_array(format('matches/%s/%s/map%s-1.webp', p_match, p_folder_team, n)),
      'players', v_players);
  end loop;
  return jsonb_build_object('maps', v_maps);
end;
$$;

do $test$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  ha uuid[];
  hb uuid[];
  v_admin uuid;
  v_season uuid;
  v_a uuid; v_b uuid;
  v_mode uuid; v_map uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid;
  x uuid;
  t uuid;
  v_mis uuid;
  v_json jsonb;
  v_checks int := 0;
begin
  foreach x in array u loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'ad' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'ad' || left(id::text, 6) || '#1234567' where id = any (u);
  ha := u[1:4];
  hb := u[5:8];
  v_admin := u[9];
  insert into public.staff_roles (user_id, role) values (v_admin, 'admin'), (u[1], 'admin');

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('Admin ' || gen_random_uuid(), 'regular') returning id into v_season;
  end if;
  update public.seasons set status = 'regular' where id = v_season;

  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Alpha ' || left(gen_random_uuid()::text, 4), 'ADA', u[1], 'approved') returning id into v_a;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Bravo ' || left(gen_random_uuid()::text, 4), 'ADB', u[5], 'approved') returning id into v_b;
  insert into public.team_members (team_id, user_id) values (v_a, u[2]), (v_a, u[3]), (v_a, u[4]), (v_b, u[6]), (v_b, u[7]), (v_b, u[8]);
  insert into public.game_modes (name) values ('HP ' || gen_random_uuid()) returning id into v_mode;
  insert into public.maps (name) values ('Map ' || gen_random_uuid()) returning id into v_map;
  insert into public.map_modes (map_id, mode_id) values (v_map, v_mode);

  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_a, v_b, now() - interval '1 hour', now() - interval '1 hour') returning id into v_m1;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 2, v_a, v_b, now() - interval '1 hour', now() - interval '1 hour') returning id into v_m2;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 3, v_a, v_b, now() + interval '2 days', now() + interval '2 days') returning id into v_m3;
  foreach x in array array[v_m1, v_m2] loop
    foreach t in array array[v_a, v_b] loop
      insert into storage.objects (bucket_id, name, owner_id)
      select 'screenshots', format('matches/%s/%s/map%s-1.webp', x, t, n), u[1]::text from generate_series(1, 5) n;
    end loop;
  end loop;

  -- Match 1: map 1 away score differs (disputed). Match 2: one kills value differs (confirmed).
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.submit_report(v_m1, pg_temp.rep(v_m1, v_a, v_a, v_b, ha, hb, array[250, 200, 6, 3, 250, 100], v_mode, v_map));
  perform public.submit_report(v_m2, pg_temp.rep(v_m2, v_a, v_a, v_b, ha, hb, array[250, 200, 6, 3, 250, 100], v_mode, v_map));
  perform set_config('request.jwt.claims', json_build_object('sub', u[5], 'role', 'authenticated')::text, true);
  perform public.submit_report(v_m1, pg_temp.rep(v_m1, v_b, v_a, v_b, ha, hb, array[250, 210, 6, 3, 250, 100], v_mode, v_map));
  perform public.submit_report(v_m2, pg_temp.rep(v_m2, v_b, v_a, v_b, ha, hb, array[250, 200, 6, 3, 250, 100], v_mode, v_map, 1, u[6]));
  reset role;
  if (select status from public.matches where id = v_m1) <> 'disputed' or (select status from public.matches where id = v_m2) <> 'confirmed' then
    raise exception 'FAIL: setup statuses wrong';
  end if;

  -- ---- Recused admin (captain of Alpha) ----------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_json := public.admin_mismatch_queue();
  if not exists (select 1 from jsonb_array_elements(v_json) e where (e ->> 'match_id')::uuid = v_m1 and (e ->> 'recused')::boolean) then
    raise exception 'FAIL: queue should flag recused matches: %', v_json;
  end if;
  if exists (select 1 from public.stat_mismatches) then
    raise exception 'FAIL: recused admin can read mismatch values';
  end if;
  reset role;
  select s.id into v_mis from public.stat_mismatches s join public.match_maps mm on mm.id = s.match_map_id where mm.match_id = v_m1;
  set local role authenticated;
  begin
    perform public.resolve_mismatch(v_mis, 'home');
    raise exception 'FAIL: recused admin resolved a mismatch';
  exception when insufficient_privilege then
    if sqlerrm not like 'Recused%' then raise; end if;
  end;
  begin
    perform public.admin_forfeit(v_m3, v_b);
    raise exception 'FAIL: recused admin set a forfeit';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.matches set status = 'cancelled' where id = v_m3;
    if found then raise exception 'FAIL: recused admin updated a match directly'; end if;
  end;
  begin
    perform public.ban_player(u[2], now() + interval '7 days', 'Testing recusal');
    raise exception 'FAIL: recused admin banned own teammate';
  exception when insufficient_privilege then null;
  end;
  v_checks := v_checks + 5;
  reset role;

  -- ---- Neutral admin ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_json := public.admin_overview();
  if (v_json ->> 'open_mismatch_matches')::int < 2 or (v_json ->> 'open_mismatch_fields')::int < 2 then
    raise exception 'FAIL: overview counts wrong: %', v_json;
  end if;
  v_checks := v_checks + 1;

  -- Resolve the score mismatch: last one on match 1, so it confirms 3-0.
  begin
    perform public.resolve_mismatch(v_mis, 'custom', 'abc');
    raise exception 'FAIL: non-numeric score accepted';
  exception when sqlstate 'P0001' then null;
  end;
  v_json := public.resolve_mismatch(v_mis, 'away');
  if (v_json ->> 'remaining')::int <> 0 or v_json ->> 'status' <> 'confirmed' then
    raise exception 'FAIL: resolving the last mismatch should confirm: %', v_json;
  end if;
  if not exists (select 1 from public.matches where id = v_m1 and home_series = 3 and away_series = 0 and result_source = 'admin')
     or (select away_score from public.match_maps where match_id = v_m1 and map_number = 1) <> 210 then
    raise exception 'FAIL: match 1 not finalized correctly';
  end if;
  -- Standings see it.
  if not exists (select 1 from public.division_standings(v_season) where team_id = v_a and wins >= 1) then
    raise exception 'FAIL: standings did not update';
  end if;
  v_checks := v_checks + 3;

  -- Resolve the kills mismatch on match 2 with a custom value.
  select s.id into v_mis from public.stat_mismatches s join public.match_maps mm on mm.id = s.match_map_id
   where mm.match_id = v_m2 and s.resolved_at is null;
  v_json := public.resolve_mismatch(v_mis, 'custom', '17');
  if (v_json ->> 'remaining')::int <> 0
     or (select kills from public.player_map_stats s join public.match_maps mm on mm.id = s.match_map_id
          where mm.match_id = v_m2 and mm.map_number = 1 and s.user_id = u[6]) <> 17
     or (select stats_status from public.match_maps where match_id = v_m2 and map_number = 1) <> 'confirmed'
     or (select count(*) from public.player_map_stats s join public.match_maps mm on mm.id = s.match_map_id where mm.match_id = v_m2) <> 24 then
    raise exception 'FAIL: player stat resolution wrong';
  end if;
  v_checks := v_checks + 1;

  -- Overturn match 1 to 3-2 for the away side? (3 home wins needed to be valid; give away 3 of 5.)
  perform public.admin_set_result(v_m1, jsonb_build_array(
    jsonb_build_object('mode_id', v_mode, 'map_id', v_map, 'home_score', 250, 'away_score', 100),
    jsonb_build_object('mode_id', v_mode, 'map_id', v_map, 'home_score', 1, 'away_score', 6),
    jsonb_build_object('mode_id', v_mode, 'map_id', v_map, 'home_score', 250, 'away_score', 100),
    jsonb_build_object('mode_id', v_mode, 'map_id', v_map, 'home_score', 1, 'away_score', 6),
    jsonb_build_object('mode_id', v_mode, 'map_id', v_map, 'home_score', 5, 'away_score', 6)));
  if not exists (select 1 from public.matches where id = v_m1 and home_series = 2 and away_series = 3 and winner_team_id = v_b)
     or (select count(*) from public.match_maps where match_id = v_m1) <> 5 then
    raise exception 'FAIL: overturn wrong';
  end if;
  -- Forfeit, then clear.
  perform public.admin_forfeit(v_m3, v_b);
  if not exists (select 1 from public.matches where id = v_m3 and status = 'forfeit' and winner_team_id = v_a)
     or (select forfeit_count from public.teams where id = v_b) <> 1 then
    raise exception 'FAIL: forfeit wrong';
  end if;
  perform public.admin_clear_result(v_m3);
  if not exists (select 1 from public.matches where id = v_m3 and status = 'scheduled' and winner_team_id is null)
     or (select forfeit_count from public.teams where id = v_b) <> 0 then
    raise exception 'FAIL: clear wrong';
  end if;
  v_checks := v_checks + 3;

  -- Ban with a reason; logged as a penalty.
  begin
    perform public.ban_player(u[6], now() + interval '7 days', '');
    raise exception 'FAIL: ban without reason';
  exception when sqlstate 'P0001' then null;
  end;
  perform public.ban_player(u[6], now() + interval '7 days', 'Toxic in comms');
  if not exists (select 1 from public.profiles where id = u[6] and banned_until > now())
     or not exists (select 1 from public.penalties where user_id = u[6] and type = 'ban' and note like '%Toxic in comms') then
    raise exception 'FAIL: ban not recorded';
  end if;
  v_checks := v_checks + 2;
  reset role;

  -- Every staff edit is in the audit log.
  if not exists (select 1 from public.audit_log where actor_id = v_admin and table_name = 'stat_mismatches')
     or not exists (select 1 from public.audit_log where actor_id = v_admin and table_name = 'matches' and row_id = v_m1::text)
     or not exists (select 1 from public.audit_log where actor_id = v_admin and table_name = 'penalties') then
    raise exception 'FAIL: admin actions missing from the audit log';
  end if;
  v_checks := v_checks + 1;

  -- The last owner can't be removed.
  begin
    delete from public.staff_roles where role = 'owner';
    if (select count(*) from public.staff_roles where role = 'owner') = 0 then
      raise exception 'FAIL: removed the last owner';
    end if;
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%at least one owner%' then raise; end if;
  end;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
