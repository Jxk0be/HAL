-- Team management: transfer the captaincy, set the co-captain (captain only), and create teams
-- only while the season is in signups.

-- Creating a team: complete captain profile, and only during signups (staff are exempt).
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
    raise exception 'Finish your profile (Activision ID, platform and confirmations) before creating a team'
      using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.seasons s where s.id = new.season_id and s.status = 'signups') then
    raise exception 'Team registration is only open during signups' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Only the captain (not the co-captain) chooses the co-captain.
create function public.teams_co_captain_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_internal() or public.can_staff_team(old.id) then
    return new;
  end if;
  if new.co_captain_id is distinct from old.co_captain_id and (select auth.uid()) <> old.captain_id then
    raise exception 'Only the captain can choose the co-captain' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger teams_co_captain_guard before update on public.teams
  for each row execute function public.teams_co_captain_guard();

-- Hand the captaincy to another rostered player. The old captain stays on the roster.
create function public.transfer_captaincy(p_team_id uuid, p_new_captain uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
begin
  select * into v_team from public.teams where id = p_team_id for update;
  if v_team.id is null then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if (select auth.uid()) is distinct from v_team.captain_id and not public.can_staff_team(p_team_id) then
    raise exception 'Only the captain can transfer the captaincy' using errcode = '42501';
  end if;
  if p_new_captain = v_team.captain_id then
    raise exception 'That player is already the captain' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.team_members tm
     where tm.team_id = p_team_id and tm.user_id = p_new_captain
       and tm.left_at is null and not tm.is_emergency
  ) then
    raise exception 'The new captain must be on the roster' using errcode = 'P0001';
  end if;

  perform set_config('hal.internal', 'on', true);
  update public.teams
     set captain_id = p_new_captain,
         co_captain_id = case when co_captain_id = p_new_captain then null else co_captain_id end
   where id = p_team_id;
  perform set_config('hal.internal', '', true);
end;
$$;

revoke execute on function public.transfer_captaincy(uuid, uuid) from public, anon;
grant execute on function public.transfer_captaincy(uuid, uuid) to authenticated, service_role;
revoke execute on function public.teams_co_captain_guard() from public, anon, authenticated;
