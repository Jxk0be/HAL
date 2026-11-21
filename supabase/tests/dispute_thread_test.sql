-- Dispute thread tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
do $test$
declare
  -- u1 captain A (also an admin: recused), u2 captain B, u3 co-captain B, u4 neutral admin, u5 player A
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_season uuid;
  v_a uuid; v_b uuid;
  v_m uuid; v_old uuid;
  v_d uuid;
  v_people jsonb;
  x uuid;
  v_checks int := 0;
begin
  foreach x in array u loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'dt' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set discord_id = 'disc-' || left(id::text, 8) where id = any (u);
  insert into public.staff_roles (user_id, role) values (u[1], 'admin'), (u[4], 'admin');

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then
    insert into public.seasons (name, status) values ('Thread ' || gen_random_uuid(), 'regular') returning id into v_season;
  end if;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Alpha ' || left(gen_random_uuid()::text, 4), 'DTA', u[1], 'approved') returning id into v_a;
  insert into public.teams (season_id, name, tag, captain_id, status) values (v_season, 'Bravo ' || left(gen_random_uuid()::text, 4), 'DTB', u[2], 'approved') returning id into v_b;
  insert into public.team_members (team_id, user_id) values (v_b, u[3]), (v_a, u[5]);
  update public.teams set co_captain_id = u[3] where id = v_b;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at)
  values (v_season, 1, v_a, v_b, now() - interval '1 hour', now() - interval '1 hour') returning id into v_m;
  insert into public.matches (season_id, week, home_team_id, away_team_id, default_at, scheduled_at, status, confirmed_at)
  values (v_season, 2, v_a, v_b, now() - interval '3 days', now() - interval '3 days', 'confirmed', now() - interval '3 days') returning id into v_old;

  -- Autocomplete: only matches inside the window.
  if (select array_agg(match_id) from public.disputable_matches_for(u[2])) <> array[v_m] then
    raise exception 'FAIL: disputable matches wrong';
  end if;
  v_checks := v_checks + 1;

  -- Bot path rules.
  begin
    perform public.open_dispute_as(u[5], v_m, 'conduct', 'Player toxic in lobby chat');
    raise exception 'FAIL: non-captain opened a dispute';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.open_dispute_as(u[2], v_old, 'score', 'Score was wrong three days ago');
    raise exception 'FAIL: dispute outside the 24h window';
  exception when sqlstate 'P0001' then null;
  end;
  v_d := public.open_dispute_as(u[3], v_m, 'stats', 'Kills on map 2 do not match the scoreboard',
    jsonb_build_array(jsonb_build_object('url', 'https://youtu.be/clip', 'note', 'clip')));
  if (select opened_by from public.disputes where id = v_d) <> u[3]
     or (select team_id from public.disputes where id = v_d) <> v_b
     or (select status from public.matches where id = v_m) <> 'disputed'
     or not exists (select 1 from public.dispute_evidence where dispute_id = v_d and added_by = u[3]) then
    raise exception 'FAIL: bot dispute not recorded correctly';
  end if;
  if not exists (select 1 from public.notifications_outbox where type = 'dispute_opened' and payload ->> 'dispute_id' = v_d::text) then
    raise exception 'FAIL: dispute_opened not queued';
  end if;
  v_checks := v_checks + 4;

  -- Thread people: 3 captains/co-captains, the neutral admin only; the admin captain is recused (but in as captain).
  v_people := public.dispute_thread_people(v_d);
  if (select array_agg(e order by e) from jsonb_array_elements_text(v_people -> 'captains') e)
       <> (select array_agg(e order by e) from unnest(array['disc-' || left(u[1]::text, 8), 'disc-' || left(u[2]::text, 8), 'disc-' || left(u[3]::text, 8)]) e)
     or not (v_people -> 'admins') ? ('disc-' || left(u[4]::text, 8))
     or (v_people -> 'admins') ? ('disc-' || left(u[1]::text, 8))
     or (v_people ->> 'recused')::int <> 1 then
    raise exception 'FAIL: thread people wrong: %', v_people;
  end if;
  v_checks := v_checks + 1;

  -- The site wrapper uses the same core.
  update public.disputes set status = 'resolved', resolution = 'Stats corrected by admins.' where id = v_d;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_d := public.open_dispute(v_m, 'other', 'Second issue found after the first was resolved');
  reset role;
  if (select opened_by from public.disputes where id = v_d) <> u[1] then
    raise exception 'FAIL: site wrapper did not record the opener';
  end if;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
