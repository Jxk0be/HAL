-- Remove the PC POV-recording pledge from onboarding (owner decision).
-- A complete profile is now: Activision ID, platform, 18+ and controller confirmations.
-- Everything that read profiles.pov_ack_at is replaced first, then the column is dropped.

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
       and p.activision_id is not null
       and p.platform is not null
       and p.age_confirmed_at is not null
       and p.controller_confirmed_at is not null
  );
$$;

create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create or replace function public.discord_sync_user_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if tg_table_name = 'profiles' then
    if tg_op = 'UPDATE'
       and new.is_free_agent is not distinct from old.is_free_agent
       and new.activision_id is not distinct from old.activision_id
       and new.platform is not distinct from old.platform
       and new.controller_confirmed_at is not distinct from old.controller_confirmed_at
       and new.age_confirmed_at is not distinct from old.age_confirmed_at
       and new.banned_until is not distinct from old.banned_until then
      return new;
    end if;
    v_user := new.id;
  elsif tg_op = 'DELETE' then
    v_user := old.user_id;
  else
    v_user := new.user_id;
  end if;
  perform public.discord_sync_enqueue('user_sync', jsonb_build_object('user_id', v_user));
  return coalesce(new, old);
end;
$$;

create or replace view public.free_agents
with (security_invoker = true) as
  select p.id,
         p.avatar_url,
         p.activision_id,
         p.platform,
         (p.activision_id is not null and p.platform is not null and p.age_confirmed_at is not null
           and p.controller_confirmed_at is not null) as profile_complete,
         p.created_at,
         fa.preferred_role,
         fa.availability,
         fa.note
    from public.profiles p
    left join public.free_agent_posts fa on fa.user_id = p.id and fa.active
   where p.is_free_agent
     and (p.banned_until is null or p.banned_until <= now());

create or replace function public.free_agent_board(
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

alter table public.profiles drop column pov_ack_at;
