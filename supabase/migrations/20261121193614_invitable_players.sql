-- Captains invite by name: search every signed-up player who could join a team, not just those
-- who ticked "List me as a free agent". That box only controls the public Free Agents page; a
-- captain who knows a player should still find them. Invites still need the player to accept.
create function public.invitable_players(p_search text, p_limit int default 8)
returns table (
  id uuid,
  discord_username text,
  avatar_url text,
  activision_id text,
  platform public.platform,
  listed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.discord_username, p.avatar_url, p.activision_id, p.platform, p.is_free_agent
    from public.profiles p
   where (select auth.uid()) is not null
     and length(btrim(coalesce(p_search, ''))) >= 2
     and p.id <> (select auth.uid())
     and (p.banned_until is null or p.banned_until <= now())
     and public.is_profile_complete(p.id)
     -- Not on a team in the current season.
     and not exists (
       select 1 from public.team_members tm
        join public.seasons s on s.id = tm.season_id
       where tm.user_id = p.id and tm.left_at is null and not tm.is_emergency
         and s.status in ('signups', 'regular', 'playoffs')
     )
     and (p.activision_id ilike public.like_pattern(p_search) or p.discord_username ilike public.like_pattern(p_search))
   order by p.is_free_agent desc, p.activision_id
   limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;
revoke execute on function public.invitable_players(text, int) from public, anon;
grant execute on function public.invitable_players(text, int) to authenticated;
