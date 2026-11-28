-- Players who aren't in the Discord server yet (or haven't been checked) can re-check once a
-- minute, so "I've joined" on the site confirms quickly. Everyone else stays at 10 minutes.
create or replace function public.request_my_discord_sync()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_wait interval;
begin
  if v_uid is null then
    return false;
  end if;
  v_wait := case
    when exists (select 1 from public.discord_presence dp where dp.user_id = v_uid and dp.in_server) then interval '10 minutes'
    else interval '1 minute'
  end;
  update public.profiles
     set discord_synced_at = now()
   where id = v_uid
     and (discord_synced_at is null or discord_synced_at < now() - v_wait);
  if not found then
    return false;
  end if;
  perform public.discord_sync_enqueue('user_sync', jsonb_build_object('user_id', v_uid));
  return true;
end;
$$;
revoke execute on function public.request_my_discord_sync() from public, anon;
grant execute on function public.request_my_discord_sync() to authenticated;
