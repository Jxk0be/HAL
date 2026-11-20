-- Free Agents board and Players directory.
-- Discord usernames are for signed-in users only: anon loses the column, the public views drop it,
-- and the board/directory functions return it only when auth.uid() is set. The public name for
-- logged-out visitors is the Activision ID.

-- ---------------------------------------------------------------------------
-- Hide discord_username from anon
-- ---------------------------------------------------------------------------
revoke select (discord_username) on public.profiles from anon;

drop view public.profiles_public;
create view public.profiles_public
with (security_invoker = true) as
  select id, avatar_url, activision_id, platform, is_free_agent, banned_until, created_at
    from public.profiles;
grant select on public.profiles_public to anon, authenticated;

drop view public.free_agents;
create view public.free_agents
with (security_invoker = true) as
  select p.id,
         p.avatar_url,
         p.activision_id,
         p.platform,
         (p.activision_id is not null and p.platform is not null and p.age_confirmed_at is not null
           and p.controller_confirmed_at is not null
           and (p.platform <> 'pc' or p.pov_ack_at is not null)) as profile_complete,
         p.created_at,
         fa.preferred_role,
         fa.availability,
         fa.note
    from public.profiles p
    left join public.free_agent_posts fa on fa.user_id = p.id and fa.active
   where p.is_free_agent
     and (p.banned_until is null or p.banned_until <= now());
grant select on public.free_agents to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Free agent posts: standard roles; joining a team deactivates your post
-- ---------------------------------------------------------------------------
alter table public.free_agent_posts
  add constraint free_agent_posts_role_check
  check (preferred_role is null or preferred_role in ('AR', 'SMG', 'Flex'));

create or replace function public.team_members_sync_free_agent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_emergency then
    return new;
  end if;
  update public.profiles p
     set is_free_agent = not exists (
       select 1 from public.team_members tm
        where tm.user_id = p.id and tm.left_at is null and not tm.is_emergency
     )
   where p.id = new.user_id;
  -- Joining a team takes your free agent post down.
  if new.left_at is null then
    update public.free_agent_posts set active = false where user_id = new.user_id and active;
  end if;
  return new;
end;
$$;

-- Posting needs no team and lists you as a free agent.
create function public.free_agent_posts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_internal() or public.is_admin() then
    return new;
  end if;
  if new.active and (tg_op = 'INSERT' or not old.active) then
    if exists (
      select 1 from public.team_members tm
       where tm.user_id = new.user_id and tm.left_at is null and not tm.is_emergency
    ) then
      raise exception 'You are on a team. Leave it to post as a free agent.' using errcode = 'P0001';
    end if;
    if not public.is_profile_complete(new.user_id) then
      raise exception 'Finish your profile before posting as a free agent.' using errcode = 'P0001';
    end if;
    update public.profiles set is_free_agent = true where id = new.user_id and not is_free_agent;
  end if;
  return new;
end;
$$;
create trigger free_agent_posts_guard before insert or update on public.free_agent_posts
  for each row execute function public.free_agent_posts_guard();
revoke execute on function public.free_agent_posts_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Search helper: escape LIKE wildcards in user input.
-- ---------------------------------------------------------------------------
create function public.like_pattern(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(btrim(p), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

-- ---------------------------------------------------------------------------
-- Free Agents board: listed free agents with a complete profile (not banned), newest posts first.
-- ---------------------------------------------------------------------------
create function public.free_agent_board(
  p_search text default null,
  p_platform public.platform default null,
  p_role text default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  id uuid,
  discord_username text,
  avatar_url text,
  activision_id text,
  platform public.platform,
  preferred_role text,
  availability text,
  note text,
  post_id uuid,
  posted_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (select (select auth.uid()) is not null as signed_in),
  rows as (
    select p.id,
           case when (select signed_in from viewer) then p.discord_username end as discord_username,
           p.avatar_url, p.activision_id, p.platform,
           fa.preferred_role, fa.availability, fa.note, fa.id as post_id, fa.updated_at as posted_at,
           p.created_at
      from public.profiles p
      left join public.free_agent_posts fa on fa.user_id = p.id and fa.active
     where p.is_free_agent
       and (p.banned_until is null or p.banned_until <= now())
       and p.activision_id is not null and p.platform is not null
       and p.age_confirmed_at is not null and p.controller_confirmed_at is not null
       and (p.platform <> 'pc' or p.pov_ack_at is not null)
       and (p_platform is null or p.platform = p_platform)
       and (p_role is null or fa.preferred_role = p_role)
       and (
         coalesce(btrim(p_search), '') = ''
         or p.activision_id ilike public.like_pattern(p_search)
         or ((select signed_in from viewer) and p.discord_username ilike public.like_pattern(p_search))
       )
  )
  select r.id, r.discord_username, r.avatar_url, r.activision_id, r.platform, r.preferred_role,
         r.availability, r.note, r.post_id, r.posted_at, count(*) over ()
    from rows r
   order by (r.post_id is null), r.posted_at desc nulls last, r.created_at desc
   limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------------------
-- Players directory: everyone with a complete profile, with their current-season team.
-- p_player_id returns one player (player page).
-- ---------------------------------------------------------------------------
create function public.player_directory(
  p_search text default null,
  p_player_id uuid default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  id uuid,
  discord_username text,
  avatar_url text,
  activision_id text,
  platform public.platform,
  is_free_agent boolean,
  banned boolean,
  team_id uuid,
  team_name text,
  team_tag text,
  team_logo_url text,
  team_role public.member_role,
  is_captain boolean,
  is_co_captain boolean,
  joined_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (select (select auth.uid()) is not null as signed_in),
  active_season as (
    select s.id from public.seasons s where s.status in ('signups', 'regular', 'playoffs') limit 1
  ),
  rows as (
    select p.id,
           case when (select signed_in from viewer) then p.discord_username end as discord_username,
           p.avatar_url, p.activision_id, p.platform, p.is_free_agent,
           coalesce(p.banned_until > now(), false) as banned,
           t.id as team_id, t.name as team_name, t.tag as team_tag, t.logo_url as team_logo_url,
           tm.role as team_role,
           coalesce(t.captain_id = p.id, false) as is_captain,
           coalesce(t.co_captain_id = p.id, false) as is_co_captain,
           tm.joined_at
      from public.profiles p
      left join public.team_members tm
        on tm.user_id = p.id and tm.left_at is null and not tm.is_emergency
       and tm.season_id = (select id from active_season)
      left join public.teams t on t.id = tm.team_id and t.status <> 'removed'
     where p.activision_id is not null
       and (p_player_id is null or p.id = p_player_id)
       and (
         coalesce(btrim(p_search), '') = ''
         or p.activision_id ilike public.like_pattern(p_search)
         or t.name ilike public.like_pattern(p_search)
         or ((select signed_in from viewer) and p.discord_username ilike public.like_pattern(p_search))
       )
  )
  select r.id, r.discord_username, r.avatar_url, r.activision_id, r.platform, r.is_free_agent, r.banned,
         r.team_id, r.team_name, r.team_tag, r.team_logo_url, r.team_role, r.is_captain, r.is_co_captain,
         r.joined_at, count(*) over ()
    from rows r
   order by lower(r.activision_id)
   limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0);
$$;

revoke execute on function public.like_pattern(text) from public;
grant execute on function public.like_pattern(text) to anon, authenticated, service_role;
grant execute on function public.free_agent_board(text, public.platform, text, int, int) to anon, authenticated;
grant execute on function public.player_directory(text, uuid, int, int) to anon, authenticated;
