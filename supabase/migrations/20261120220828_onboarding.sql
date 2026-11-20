-- Profile onboarding: controller and PC POV confirmations, Activision ID format and uniqueness,
-- and "complete profile" checks before creating or joining a team.

alter table public.profiles
  add column controller_confirmed_at timestamptz,
  add column pov_ack_at timestamptz;

-- Activision ID: Name#1234567 (loose), unique ignoring case.
alter table public.profiles
  add constraint profiles_activision_id_format
  check (activision_id is null or activision_id ~ '^[^#\s][^#]{1,31}#[0-9]{4,10}$');
create unique index profiles_activision_id_unique_idx on public.profiles (lower(activision_id))
  where activision_id is not null;

grant select (controller_confirmed_at, pov_ack_at) on public.profiles to anon, authenticated;
grant update (controller_confirmed_at, pov_ack_at) on public.profiles to authenticated;

-- Complete = Activision ID, platform, 18+, controller, and (for PC) the POV recording pledge.
create function public.is_profile_complete(p_user_id uuid)
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
       and (p.platform <> 'pc' or p.pov_ack_at is not null)
  );
$$;
revoke execute on function public.is_profile_complete(uuid) from public, anon;
grant execute on function public.is_profile_complete(uuid) to authenticated, service_role;

-- Profile guard: confirmations are set-once and stamped by the server; bans are staff-only;
-- you can't list yourself as a free agent while you're on a team.
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
  if new.pov_ack_at is distinct from old.pov_ack_at then
    -- Re-confirming is allowed (e.g. switching back to PC); clearing it is not.
    if new.pov_ack_at is null then
      raise exception 'The POV recording pledge cannot be withdrawn' using errcode = '42501';
    end if;
    new.pov_ack_at := now();
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

-- Creating a team needs a complete captain profile (staff and the service role are exempt).
create function public.teams_require_complete_profile()
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
    raise exception 'Finish your profile (Activision ID, platform and confirmations) before creating a team'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger teams_require_complete_profile before insert on public.teams
  for each row execute function public.teams_require_complete_profile();

-- Joining a roster (accepting an invite) needs a complete profile; staff fixes are exempt.
create function public.team_members_require_complete_profile()
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
    raise exception 'Finish your profile (Activision ID, platform and confirmations) before joining a team'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger team_members_require_complete_profile before insert on public.team_members
  for each row execute function public.team_members_require_complete_profile();

revoke execute on function
  public.teams_require_complete_profile(), public.team_members_require_complete_profile()
  from public, anon, authenticated;

-- Free agent list: profile_complete now includes the confirmations.
create or replace view public.free_agents
with (security_invoker = true) as
  select p.id,
         p.discord_username,
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
