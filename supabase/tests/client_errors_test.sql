-- Client error reporting and admin health tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
do $test$
declare
  v_ok int := 0;
  i int;
  v_admin uuid := gen_random_uuid();
  v_json jsonb;
begin
  -- Anonymous visitors can report; one session is capped at 10 a minute.
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  for i in 1 .. 15 loop
    if public.log_client_error('TypeError: x is undefined', 'at foo', 'https://hal.example/matches', 'test-agent', 'session-abc', 'dev') then
      v_ok := v_ok + 1;
    end if;
  end loop;
  begin
    perform 1 from public.client_errors limit 1;
    raise exception 'FAIL: visitors can read client errors';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if v_ok <> 10 then
    raise exception 'FAIL: rate limit let % through', v_ok;
  end if;
  if public.log_client_error('   ') then
    raise exception 'FAIL: empty message logged';
  end if;

  -- Admins get the health summary; players don't.
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_admin, 'authenticated', 'authenticated', v_admin || '@test.hal', jsonb_build_object('provider_id', 'd-' || v_admin, 'full_name', 'hl'), now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_health();
    raise exception 'FAIL: player read admin health';
  exception when insufficient_privilege then null;
  end;
  reset role;
  insert into public.staff_roles (user_id, role) values (v_admin, 'admin');
  set local role authenticated;
  v_json := public.admin_health();
  reset role;
  if (v_json ->> 'client_errors_24h')::int < 10 or jsonb_array_length(v_json -> 'cron') < 4 then
    raise exception 'FAIL: health summary wrong: %', left(v_json::text, 300);
  end if;
  raise exception 'ALL TESTS PASSED (5 checks)';
end;
$test$;
