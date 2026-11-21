-- Invite DMs (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
do $test$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_season uuid; v_team uuid; v_inv uuid; v_inv2 uuid; v_status text;
  v_checks int := 0; x uuid;
begin
  foreach x in array u loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'iv' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'iv' || left(id::text, 6) || '#1234567', platform = 'xbox', age_confirmed_at = now(), controller_confirmed_at = now()
   where id = any (u);
  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs');
  if v_season is null then insert into public.seasons (name, status) values ('IV ' || gen_random_uuid(), 'signups') returning id into v_season; end if;
  update public.seasons set status = 'signups', roster_lock_at = null where id = v_season;
  insert into public.teams (season_id, name, tag, captain_id) values (v_season, 'IV ' || left(gen_random_uuid()::text, 4), 'IVT', u[1]) returning id into v_team;

  -- Captain invites from the site: a DM is queued.
  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_inv := public.invite_player(v_team, u[2]);
  v_inv2 := public.invite_player(v_team, u[3]);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if not exists (select 1 from public.notifications_outbox where type = 'team_invite_sent' and payload->>'invite_id' = v_inv::text) then
    raise exception 'FAIL: no DM queued';
  end if;
  v_checks := v_checks + 1;

  -- Someone else can't answer it through the bot.
  begin
    perform public.respond_to_invite_as(u[3], v_inv, true);
    raise exception 'FAIL: another player answered the invite';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  v_checks := v_checks + 1;

  -- The player accepts from the DM: joins the team as if on the site, and the team is told.
  v_status := public.respond_to_invite_as(u[2], v_inv, true);
  if v_status <> 'accepted'
     or not exists (select 1 from public.team_members where team_id = v_team and user_id = u[2] and left_at is null)
     or (select is_free_agent from public.profiles where id = u[2])
     or not exists (select 1 from public.notifications_outbox where type = 'team_invite_closed' and payload->>'invite_id' = v_inv::text and payload->>'status' = 'accepted') then
    raise exception 'FAIL: accept from DM did not join the team or notify (%)', v_status;
  end if;
  -- The bot's call doesn't leave the player's identity behind.
  if coalesce(current_setting('request.jwt.claims', true), '') <> '' then
    raise exception 'FAIL: claims leaked';
  end if;
  v_checks := v_checks + 2;

  -- Decline from the DM.
  v_status := public.respond_to_invite_as(u[3], v_inv2, false);
  if v_status <> 'declined' then
    raise exception 'FAIL: decline returned %', v_status;
  end if;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end;
$test$;
