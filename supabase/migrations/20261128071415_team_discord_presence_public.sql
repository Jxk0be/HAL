-- Rule 3.13: every rostered player must be in the league Discord. Team pages show publicly who
-- isn't, so team_discord_presence() is now readable by everyone (signed in or not). It returns
-- only user ids and a yes/no; names come from the roster query the page already makes (Discord
-- names stay signed-in only).
create or replace function public.team_discord_presence(p_team_id uuid)
returns table (user_id uuid, in_server boolean, checked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select tm.user_id, dp.in_server, dp.checked_at
  from public.team_members tm
  left join public.discord_presence dp on dp.user_id = tm.user_id
  where tm.team_id = p_team_id
    and tm.left_at is null
    and tm.is_emergency = false;
$$;
revoke execute on function public.team_discord_presence(uuid) from public;
grant execute on function public.team_discord_presence(uuid) to anon, authenticated;
