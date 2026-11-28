-- site_counts tests (rolled back; expect: ERROR: ALL TESTS PASSED (n checks)).
do $test$
declare
  u uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  before record;
  after record;
  v_checks int := 0;
  x uuid;
begin
  select * into before from public.site_counts();
  foreach x in array array[u, staff] loop
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', x || '@test.hal', jsonb_build_object('provider_id', 'd-' || x, 'full_name', 'sc' || left(x::text, 6)), now(), now());
  end loop;
  update public.profiles set activision_id = 'sc' || left(id::text, 6) || '#1234567', platform = 'xbox', cod_rank = 'gold',
                             age_confirmed_at = now(), controller_confirmed_at = now()
   where id in (u, staff);
  update public.profiles set is_player = false where id = staff;

  select * into after from public.site_counts();
  if after.players <> before.players + 1 then
    raise exception 'FAIL: a complete player should count once and a staff-only account not at all (% → %)', before.players, after.players;
  end if;
  v_checks := v_checks + 1;

  -- Logged out works.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select * into after from public.site_counts();
  reset role;
  if after.players is null then raise exception 'FAIL: anon could not read the counts'; end if;
  v_checks := v_checks + 1;

  raise exception 'ALL TESTS PASSED (% checks)', v_checks;
end
$test$;
