-- Skill bracket (rules 2.8–2.9): BIL is for Gold to Crimson players. Iridescent players can play
-- only with an exception an admin approves; Bronze, Silver and Top 250 can't play in the league.
-- The rank that counts is the higher of the player's peak rank in the previous Call of Duty and
-- their current rank. Players set it on their profile; 8s (eights_join) stays open to everyone.
--
-- is_profile_complete() now also requires an eligible rank, so every place that already checks it
-- (joining or creating a team, free agent posts, emergency subs, /lfg, the invite search) enforces
-- the bracket. rank_block_reason() gives players the exact reason.

create type public.cod_rank as enum ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'crimson', 'iridescent', 'top250');

alter table public.profiles
  add column cod_rank public.cod_rank,
  add column rank_exception_at timestamptz,
  add column rank_exception_by uuid references public.profiles (id) on delete set null;

-- profiles uses column grants: new columns are invisible until granted (see CLAUDE.md).
grant select (cod_rank, rank_exception_at) on public.profiles to anon, authenticated;
grant update (cod_rank) on public.profiles to authenticated;

-- Null when the player's rank lets them play in the league, otherwise why not.
create function public.rank_block_reason(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p.cod_rank is null then 'Set your rank on your profile first (rule 2.8).'
           when p.cod_rank in ('bronze', 'silver') then 'BIL is for Gold to Crimson players, so your rank can''t play in the league (rule 2.8). 8s are open to everyone.'
           when p.cod_rank = 'top250' then 'Top 250 players can''t play in BIL (rule 2.8). 8s are open to everyone.'
           when p.cod_rank = 'iridescent' and p.rank_exception_at is null then 'Iridescent players need an exception approved by an admin before they can play (rule 2.9). The admins have been told.'
         end
    from public.profiles p
   where p.id = p_user_id;
$$;

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
       and (p.cod_rank between 'gold' and 'crimson'
            or (p.cod_rank = 'iridescent' and p.rank_exception_at is not null))
  );
$$;

-- Clear messages when the rank is what's missing.
create or replace function public.team_members_require_complete_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_internal() or public.can_staff_team(new.team_id)
     or coalesce(current_setting('hal.staff_approved', true), '') = 'on' then
    return new;
  end if;
  if not public.is_profile_complete(new.user_id) then
    raise exception '%', coalesce(
      case when exists (select 1 from public.profiles p where p.id = new.user_id and p.activision_id is not null
                          and p.platform is not null and p.age_confirmed_at is not null and p.controller_confirmed_at is not null)
           then public.rank_block_reason(new.user_id) end,
      'Finish your profile (Activision ID, platform, rank and confirmations) before joining a team')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.teams_require_complete_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_internal() or public.is_admin() then
    return new;
  end if;
  if not public.is_profile_complete(new.captain_id) then
    raise exception '%', coalesce(
      case when exists (select 1 from public.profiles p where p.id = new.captain_id and p.activision_id is not null
                          and p.platform is not null and p.age_confirmed_at is not null and p.controller_confirmed_at is not null)
           then public.rank_block_reason(new.captain_id) end,
      'Finish your profile (Activision ID, platform, rank and confirmations) before creating a team')
      using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.seasons s where s.id = new.season_id and s.status = 'signups') then
    raise exception 'Team registration is only open during signups' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.free_agent_posts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_internal() then
    return new;
  end if;
  if new.active and (tg_op = 'INSERT' or not old.active) then
    -- Staff-only accounts can't be free agents, admins included.
    if not exists (select 1 from public.profiles p where p.id = new.user_id and p.is_player) then
      raise exception 'Staff-only accounts can''t post as a free agent.' using errcode = 'P0001';
    end if;
    if not public.is_admin() then
      if exists (
        select 1 from public.team_members tm
         where tm.user_id = new.user_id and tm.left_at is null and not tm.is_emergency
      ) then
        raise exception 'You are on a team. Leave it to post as a free agent.' using errcode = 'P0001';
      end if;
      if not public.is_profile_complete(new.user_id) then
        raise exception '%', coalesce(public.rank_block_reason(new.user_id), 'Finish your profile before posting as a free agent.')
          using errcode = 'P0001';
      end if;
    end if;
    update public.profiles set is_free_agent = true where id = new.user_id and not is_free_agent;
  end if;
  return new;
end;
$$;

-- Rebrand leftover plus the rank in the emergency-sub message.
do $$
declare
  v_def text := pg_get_functiondef('public.roster_requests_guard()'::regprocedure);
begin
  if position('finished their HAL profile (rule 2.5)' in v_def) > 0 then
    execute replace(v_def, 'That player hasn''''t finished their HAL profile (rule 2.5)',
                    'That player''''s profile isn''''t finished or their rank can''''t play in the league (rules 2.5 and 2.8)');
  end if;
end $$;

-- Ranks: players set their own; a rank change drops any exception (it was for the old rank).
-- Only set_rank_exception() (admins) can approve or revoke one.
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

  if new.cod_rank is distinct from old.cod_rank then
    new.rank_exception_at := null;
    new.rank_exception_by := null;
  elsif (new.rank_exception_at is distinct from old.rank_exception_at or new.rank_exception_by is distinct from old.rank_exception_by)
        and not public.is_internal() and coalesce(current_setting('bil.rank_exception', true), '') <> 'on' then
    raise exception 'Only admins can approve rank exceptions' using errcode = '42501';
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

-- Admins approve (or revoke) an Iridescent player's exception. Logged in the audit log.
create function public.set_rank_exception(p_user_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve rank exceptions' using errcode = '42501';
  end if;
  select coalesce(activision_id, discord_username, 'a player') into v_name
    from public.profiles where id = p_user_id and (not p_approve or cod_rank = 'iridescent');
  if v_name is null then
    raise exception 'Exceptions are only for players whose rank is Iridescent.' using errcode = 'P0001';
  end if;
  perform set_config('bil.rank_exception', 'on', true);
  update public.profiles
     set rank_exception_at = case when p_approve then now() end,
         rank_exception_by = case when p_approve then (select auth.uid()) end
   where id = p_user_id;
  insert into public.audit_log (actor_id, actor_role, action, table_name, row_id, new_data)
  values ((select auth.uid()), 'admin', case when p_approve then 'approved' else 'revoked' end, 'profiles', p_user_id::text,
          jsonb_build_object('name', 'Iridescent exception for ' || v_name));
end;
$$;

-- Tell the admins (#admin-only) when a player sets Iridescent and needs an exception.
create function public.profiles_rank_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cod_rank = 'iridescent' and old.cod_rank is distinct from 'iridescent' and new.is_player then
    perform public.enqueue_notification('rank_exception_needed', jsonb_build_object('user_id', new.id));
  end if;
  return new;
end;
$$;
create trigger profiles_rank_notify after update of cod_rank on public.profiles
  for each row execute function public.profiles_rank_notify();

-- The free agent board only lists players who can be signed.
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
       and (p.banned_until is null or p.banned_until <= now())
       and public.is_profile_complete(p.id)
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

revoke execute on function public.rank_block_reason(uuid) from public, anon;
grant execute on function public.rank_block_reason(uuid) to authenticated, service_role;
revoke execute on function public.set_rank_exception(uuid, boolean) from public, anon;
grant execute on function public.set_rank_exception(uuid, boolean) to authenticated;
revoke execute on function public.profiles_rank_notify() from public, anon, authenticated;
