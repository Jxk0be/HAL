-- Discord /report draft tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
do $test$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_season uuid;
  v_a uuid; v_b uuid;
  v_m uuid; v_future uuid; v_done uuid;
  v_draft uuid;
  x uuid;
  v_checks int := 0;
begin
  foreach x in array u loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'dr' || left(x::text, 6)), now(), now());
  end loop;
  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('Draft ' || gen_random_uuid(), 'regular') returning id into v_season;
  end if;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Alpha ' || left(gen_random_uuid()::text, 4), 'DRA', u[1], 'approved') returning id into v_a;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Bravo ' || left(gen_random_uuid()::text, 4), 'DRB', u[2], 'approved') returning id into v_b;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_a, v_b, now() - interval '1 hour', now() - interval '1 hour') returning id into v_m;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 2, v_a, v_b, now() + interval '1 hour', now() + interval '1 hour') returning id into v_future;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at, status)
  values (v_season, 3, v_a, v_b, now() - interval '2 hours', now() - interval '2 hours', 'confirmed') returning id into v_done;

  -- Only started, unsettled matches can be reported.
  if (select array_agg(match_id) from public.reportable_matches_for(u[1])) <> array[v_m] then
    raise exception 'FAIL: reportable matches wrong';
  end if;
  if exists (select 1 from public.reportable_matches_for(u[3])) then
    raise exception 'FAIL: non-captain has reportable matches';
  end if;
  v_checks := v_checks + 2;

  insert into public.report_drafts (match_id, team_id, created_by, maps, screenshot_paths)
  values (v_m, v_a, u[1], '[{"number":1}]', array['matches/x/y/map1-1.png']) returning id into v_draft;
  -- A draft is not a report: nothing is compared.
  if exists (select 1 from public.report_submissions where match_id = v_m) or (select status from public.matches where id = v_m) <> 'scheduled' then
    raise exception 'FAIL: a draft changed the match';
  end if;
  v_checks := v_checks + 1;

  -- Own captain reads it; the opponent and visitors don't; nobody writes it from the API.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not exists (select 1 from public.report_drafts where id = v_draft) then
    raise exception 'FAIL: own team cannot read its draft';
  end if;
  begin
    update public.report_drafts set maps = '[]' where id = v_draft;
    raise exception 'FAIL: draft writable from the API';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', u[2], 'role', 'authenticated')::text, true);
  if exists (select 1 from public.report_drafts where id = v_draft) then
    raise exception 'FAIL: opponent can read the draft';
  end if;
  begin
    perform 1 from public.pending_discord_reports limit 1;
    raise exception 'FAIL: pending reports readable';
  exception when insufficient_privilege then null;
  end;
  reset role;
  set local role anon;
  begin
    perform 1 from public.report_drafts limit 1;
    if found then raise exception 'FAIL: visitors can read drafts'; end if;
  exception when insufficient_privilege then null;
  end;
  reset role;
  v_checks := v_checks + 5;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
