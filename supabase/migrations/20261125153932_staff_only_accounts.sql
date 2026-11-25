-- Staff-only accounts: league staff who don't play. profiles.is_player = false keeps the account
-- (and its staff roles) but takes it out of everything player-facing: player directory, free agent
-- board, invite search, emergency subs, /lfg, and it can never captain or join a team.
-- Only the owner can switch it, and not while the account is on a team this season.

alter table public.profiles add column is_player boolean not null default true;

-- "Complete" now also means "plays": every player-only gate (team creation, joining, /lfg, invite
-- search, emergency subs) already checks this function.
create or replace function public.is_profile_complete(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user_id
       and p.is_player
       and p.activision_id is not null
       and p.platform is not null
       and p.age_confirmed_at is not null
       and p.controller_confirmed_at is not null
  );
$$;

-- Hard stop, even for admins and the SQL editor: a staff-only account is never on a roster.
create function public.staff_only_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if tg_table_name = 'teams' then
    v_ids := array[new.captain_id, new.co_captain_id];
  else
    if new.left_at is not null then
      return new;
    end if;
    v_ids := array[new.user_id];
  end if;
  if exists (select 1 from public.profiles p where p.id = any (v_ids) and not p.is_player) then
    raise exception 'Staff-only accounts can''t be on a team' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger teams_staff_only before insert or update of captain_id, co_captain_id on public.teams
  for each row execute function public.staff_only_guard();
create trigger team_members_staff_only before insert or update of user_id, left_at on public.team_members
  for each row execute function public.staff_only_guard();

create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_player is distinct from old.is_player then
    if not public.is_internal() and not public.is_owner() then
      raise exception 'Only the owner can change whether an account plays' using errcode = '42501';
    end if;
    if not new.is_player and exists (
      select 1 from public.team_members tm
        join public.seasons s on s.id = tm.season_id
       where tm.user_id = new.id and tm.left_at is null and not tm.is_emergency
         and s.status in ('signups', 'regular', 'playoffs')
    ) then
      raise exception 'This account is on a team this season. Remove it from the team first.' using errcode = 'P0001';
    end if;
  end if;
  if not new.is_player then
    new.is_free_agent := false;
  end if;

  if public.is_internal() then
    return new;
  end if;
  if new.banned_until is distinct from old.banned_until
     and (not public.is_admin() or old.id = (select auth.uid())) then
    raise exception 'Only league staff can change bans' using errcode = '42501';
  end if;

  if new.age_confirmed_at is distinct from old.age_confirmed_at then
    if old.age_confirmed_at is not null then
      raise exception 'Age confirmation cannot be changed once given' using errcode = '42501';
    end if;
    new.age_confirmed_at := now();
  end if;
  if new.controller_confirmed_at is distinct from old.controller_confirmed_at then
    if old.controller_confirmed_at is not null then
      raise exception 'Controller confirmation cannot be changed once given' using errcode = '42501';
    end if;
    new.controller_confirmed_at := now();
  end if;

  if new.is_free_agent and not old.is_free_agent and exists (
    select 1 from public.team_members tm
     where tm.user_id = new.id and tm.left_at is null and not tm.is_emergency
  ) then
    raise exception 'You are on a team. Leave it to list yourself as a free agent.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Player-facing lists skip staff-only accounts.
create or replace function public.player_directory(p_search text default null, p_player_id uuid default null, p_limit integer default 30, p_offset integer default 0)
returns table (id uuid, discord_username text, avatar_url text, activision_id text, platform public.platform, is_free_agent boolean, banned boolean, team_id uuid, team_name text, team_tag text, team_logo_url text, team_role public.member_role, is_captain boolean, is_co_captain boolean, joined_at timestamptz, total_count bigint)
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
       and p.is_player
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

create or replace function public.free_agent_board(p_search text default null, p_platform public.platform default null, p_role text default null, p_limit integer default 30, p_offset integer default 0)
returns table (id uuid, discord_username text, avatar_url text, activision_id text, platform public.platform, preferred_role text, availability text, note text, post_id uuid, posted_at timestamptz, total_count bigint)
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
       and p.is_player
       and (p.banned_until is null or p.banned_until <= now())
       and p.activision_id is not null and p.platform is not null
       and p.age_confirmed_at is not null and p.controller_confirmed_at is not null
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
