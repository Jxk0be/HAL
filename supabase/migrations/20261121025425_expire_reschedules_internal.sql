-- expire_reschedule_requests() marks its writes as internal, so the reschedule guard lets them
-- through even when a user session is present (it previously relied on running without one).
create or replace function public.expire_reschedule_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_prev text := coalesce(current_setting('hal.internal', true), '');
begin
  perform set_config('hal.internal', 'on', true);
  update public.reschedule_requests r
     set status = 'expired'
    from public.matches m
   where m.id = r.match_id and r.status = 'pending' and now() > m.default_at - interval '24 hours';
  get diagnostics v_count = row_count;
  perform set_config('hal.internal', v_prev, true);
  return v_count;
end;
$$;
revoke execute on function public.expire_reschedule_requests() from public, anon, authenticated;
