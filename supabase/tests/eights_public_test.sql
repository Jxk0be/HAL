-- eights_public_state tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
-- Logged-out callers get counts and Activision IDs only; signed-in callers also see the queue.
-- The match uses OVERRIDING SYSTEM VALUE so the test never burns a real 8s match number.
do $test$
declare
  p uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  q uuid := gen_random_uuid();
  v_match uuid;
  st jsonb;
  v_checks int := 0;
  x uuid;
  i int := 0;
begin
  foreach x in array p || array[q] loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'e8' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'e8' || left(id::text, 6) || '#1234567', discord_username = 'disc_' || left(id::text, 6)
   where id = any (p || array[q]);
  insert into public.eights_queue (user_id, joined_at) values (q, now());
  insert into public.eights_matches (number, status, winner, mode_name, map_name, resolved_at)
  overriding system value
  values (999999, 'confirmed', 'a', 'Hardpoint', 'Test Map', now()) returning id into v_match;
  foreach x in array p loop
    i := i + 1;
    insert into public.eights_players (match_id, user_id, team) values (v_match, x, case when i <= 4 then 'a' else 'b' end);
  end loop;

  -- Logged out: count only, Activision IDs only.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  st := public.eights_public_state();
  reset role;
  if (st->>'queue_count')::int < 1 then raise exception 'FAIL: queue count missing'; end if;
  v_checks := v_checks + 1;
  if jsonb_array_length(st->'queue') <> 0 then raise exception 'FAIL: anon saw queue names'; end if;
  v_checks := v_checks + 1;
  if st::text like '%disc_%' then raise exception 'FAIL: anon saw a Discord name'; end if;
  v_checks := v_checks + 1;
  if not exists (select 1 from jsonb_array_elements(st->'recent') r where r->>'id' = v_match::text and jsonb_array_length(r->'team_a') = 4) then
    raise exception 'FAIL: recent result missing or wrong team size';
  end if;
  v_checks := v_checks + 1;
  if not exists (select 1 from jsonb_array_elements(st->'leaderboard') l where l->>'user_id' = p[1]::text and (l->>'wins')::int >= 1) then
    raise exception 'FAIL: winner missing from leaderboard';
  end if;
  v_checks := v_checks + 1;
  if st::text ~ 'discord_id' then raise exception 'FAIL: Discord ids exposed'; end if;
  v_checks := v_checks + 1;

  -- Signed in: queue names, Discord names allowed.
  perform set_config('request.jwt.claims', json_build_object('sub', p[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  st := public.eights_public_state();
  reset role;
  if not (st->'queue' ? ('disc_' || left(q::text, 6))) then raise exception 'FAIL: signed-in caller should see the queue by name: %', st->'queue'; end if;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end
$test$;
