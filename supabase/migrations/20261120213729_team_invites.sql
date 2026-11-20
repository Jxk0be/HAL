-- Team invites and the automatic free agent list.
--
-- Flow: a user signs in with Discord -> they are a free agent. A captain invites them (from a
-- search on the team page or from the Free Agents page) while the team has an open spot. The player
-- accepts or declines; accepting puts them on the roster immediately (no admin approval) and cancels
-- their other pending invites. Captains remove players and players leave on their own; admin
-- approval (roster_requests) remains only for emergency subs.
-- Roster shape: up to 4 starters (the captain is one) + 3 subs (season settings).

-- ---------------------------------------------------------------------------
-- Season roster shape
-- ---------------------------------------------------------------------------
alter table public.seasons
  add column max_starters smallint not null default 4 check (max_starters between 4 and 6),
  add column max_subs smallint not null default 3 check (max_subs between 0 and 6);

-- ---------------------------------------------------------------------------
-- Free agents: everyone starts as one
-- ---------------------------------------------------------------------------
alter table public.profiles alter column is_free_agent set default true;
update public.profiles p
   set is_free_agent = not exists (
     select 1 from public.team_members tm
      where tm.user_id = p.id and tm.left_at is null and not tm.is_emergency
   );

-- Keep is_free_agent in step with roster membership.
create function public.team_members_sync_free_agent()
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
  return new;
end;
$$;

create trigger team_members_sync_free_agent
  after insert or update of left_at on public.team_members
  for each row execute function public.team_members_sync_free_agent();

-- Public free agent list: free agents who aren't banned, with their optional post.
create view public.free_agents
with (security_invoker = true) as
  select p.id,
         p.discord_username,
         p.avatar_url,
         p.activision_id,
         p.platform,
         p.age_confirmed_at is not null and p.activision_id is not null as profile_complete,
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
-- Roster role caps (starters / subs) in the roster guard
-- ---------------------------------------------------------------------------
create or replace function public.team_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_season public.seasons;
  v_active int;
  v_role_count int;
  v_role_cap int;
  v_counts_as_change boolean;
  v_is_join boolean;
  v_is_drop boolean;
  v_roster_rpc boolean := coalesce(current_setting('hal.roster_rpc', true), '') = 'on';
begin
  select * into v_team from public.teams where id = new.team_id;
  select * into v_season from public.seasons where id = v_team.season_id;
  new.season_id := v_team.season_id;

  v_is_join := tg_op = 'INSERT' and new.left_at is null;
  v_is_drop := tg_op = 'UPDATE' and old.left_at is null and new.left_at is not null;

  if tg_op = 'UPDATE' then
    if new.team_id <> old.team_id or new.user_id <> old.user_id then
      raise exception 'Move players by dropping and re-adding them' using errcode = 'P0001';
    end if;
    if old.left_at is not null and new.left_at is null then
      raise exception 'Re-add a dropped player with a new invite' using errcode = 'P0001';
    end if;
    -- Direct updates by captains (non-staff) may only switch starter/sub; drops use the RPCs.
    if not public.is_internal() and not v_roster_rpc and not public.can_staff_team(new.team_id)
       and (new.left_at is distinct from old.left_at
            or new.is_emergency is distinct from old.is_emergency
            or new.emergency_match_id is distinct from old.emergency_match_id
            or new.joined_at is distinct from old.joined_at) then
      raise exception 'Use Remove player or Leave team to change the roster' using errcode = '42501';
    end if;
  end if;

  if v_is_drop then
    if new.user_id = v_team.captain_id then
      raise exception 'Transfer the captaincy before the captain leaves' using errcode = 'P0001';
    end if;
    if new.user_id = v_team.co_captain_id then
      perform set_config('hal.internal', 'on', true);
      update public.teams set co_captain_id = null where id = v_team.id;
      perform set_config('hal.internal', '', true);
    end if;
  end if;

  if v_is_join then
    if v_team.status = 'removed' then
      raise exception 'This team has been removed from the league' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.profiles p where p.id = new.user_id and p.banned_until > now()) then
      raise exception 'This player is banned' using errcode = 'P0001';
    end if;

    if new.is_emergency then
      if not exists (
        select 1 from public.matches m
         where m.id = new.emergency_match_id and new.team_id in (m.home_team_id, m.away_team_id)
      ) then
        raise exception 'An emergency sub must be tied to one of this team''s matches' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from public.team_members tm
         where tm.season_id = new.season_id and tm.user_id = new.user_id
           and tm.left_at is null and not tm.is_emergency
      ) then
        raise exception 'Emergency subs must be free agents' using errcode = 'P0001';
      end if;
    else
      select count(*) into v_active
        from public.team_members tm
       where tm.team_id = new.team_id and tm.left_at is null and not tm.is_emergency;
      if v_active >= v_season.max_roster then
        raise exception 'Roster is full (max % players)', v_season.max_roster using errcode = 'P0001';
      end if;

      if exists (
        select 1 from public.team_members tm
         where tm.season_id = new.season_id and tm.user_id = new.user_id
           and tm.left_at is null and not tm.is_emergency
      ) then
        raise exception 'This player is already on a team this season' using errcode = 'P0001';
      end if;

      if v_team.division_id is not null and exists (
        select 1
          from public.team_members tm
          join public.teams t on t.id = tm.team_id
         where tm.user_id = new.user_id
           and t.division_id = v_team.division_id
           and t.id <> v_team.id
           and tm.left_at > now() - interval '7 days'
      ) then
        raise exception 'A dropped player cannot join another team in the same division for 7 days'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Starter / sub caps, on joining or switching role.
  if not new.is_emergency and new.left_at is null
     and (v_is_join or (tg_op = 'UPDATE' and new.role is distinct from old.role)) then
    v_role_cap := case new.role when 'starter' then v_season.max_starters else v_season.max_subs end;
    select count(*) into v_role_count
      from public.team_members tm
     where tm.team_id = new.team_id and tm.left_at is null and not tm.is_emergency
       and tm.role = new.role and tm.id <> new.id;
    if v_role_count >= v_role_cap then
      raise exception '% spots are full (max %)',
        case new.role when 'starter' then 'Starter' else 'Sub' end, v_role_cap
        using errcode = 'P0001';
    end if;
  end if;

  -- Roster lock and roster-change limits (not for emergency spots).
  if (v_is_join or v_is_drop) and not new.is_emergency then
    if v_season.roster_lock_at is not null and now() >= v_season.roster_lock_at
       and not public.is_internal() and not public.can_staff_team(new.team_id)
       and coalesce(current_setting('hal.staff_approved', true), '') <> 'on' then
      raise exception 'Rosters are locked for this season' using errcode = 'P0001';
    end if;

    -- Building the roster before the season starts is free; adds/drops in season count.
    v_counts_as_change := v_season.status in ('regular', 'playoffs')
                          and not (v_is_join and new.user_id = v_team.captain_id);
    if v_counts_as_change then
      if v_team.roster_changes_used >= v_season.max_roster_changes then
        raise exception 'No roster changes left (% per season)', v_season.max_roster_changes
          using errcode = 'P0001';
      end if;
      perform set_config('hal.internal', 'on', true);
      update public.teams set roster_changes_used = roster_changes_used + 1 where id = v_team.id;
      perform set_config('hal.internal', '', true);
    end if;
  end if;

  return new;
end;
$$;

-- Adds and drops no longer go through roster_requests (only emergency subs do).
create or replace function public.roster_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_eligible int;
  v_match public.matches;
begin
  select * into v_team from public.teams where id = new.team_id;

  if tg_op = 'INSERT' then
    if new.type = 'add' then
      raise exception 'Invite the player to your team instead' using errcode = 'P0001';
    elsif new.type = 'drop' then
      raise exception 'Use Remove player (captains) or Leave team (players) instead' using errcode = 'P0001';
    end if;
    if not public.is_internal() then
      new.requested_by := (select auth.uid());
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;

    select * into v_match from public.matches where id = new.match_id;
    if v_match.id is null or new.team_id not in (v_match.home_team_id, v_match.away_team_id) then
      raise exception 'An emergency sub request must name one of this team''s matches' using errcode = 'P0001';
    end if;
    select count(*) into v_eligible
      from public.team_members tm
     where tm.team_id = new.team_id and tm.left_at is null and not tm.is_emergency
       and tm.joined_at <= v_match.scheduled_at - interval '24 hours';
    if v_eligible >= 4 then
      raise exception 'Emergency subs are only for teams with fewer than 4 eligible players' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.team_members tm
       where tm.season_id = v_team.season_id and tm.user_id = new.user_id
         and tm.left_at is null and not tm.is_emergency
    ) then
      raise exception 'Emergency subs must be free agents' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE (review)
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'This request has already been reviewed' using errcode = 'P0001';
  end if;
  if new.team_id <> old.team_id or new.user_id <> old.user_id or new.type <> old.type
     or new.match_id is distinct from old.match_id or new.requested_by <> old.requested_by then
    raise exception 'Only the status and note of a request can change' using errcode = 'P0001';
  end if;
  if new.status <> old.status and not public.is_internal() then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

drop policy "captains request roster changes; players request their own drop" on public.roster_requests;
create policy "captains request emergency subs" on public.roster_requests
  for insert to authenticated with check ((select public.is_captain_of(team_id)));

-- ---------------------------------------------------------------------------
-- Team invites
-- ---------------------------------------------------------------------------
create type public.invite_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'expired');

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid not null references public.profiles (id),
  role public.member_role,                   -- null = starter if a starter spot is open, else sub
  status public.invite_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '7 days',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index team_invites_one_pending_idx on public.team_invites (team_id, user_id)
  where status = 'pending';
create index team_invites_user_pending_idx on public.team_invites (user_id) where status = 'pending';
create index team_invites_invited_by_idx on public.team_invites (invited_by);

alter table public.team_invites enable row level security;
create trigger set_updated_at before update on public.team_invites
  for each row execute function public.set_updated_at();

-- Read: the invited player, the team's captains, staff. Writes only through the RPCs below.
create policy "invitee, captains and staff read invites" on public.team_invites
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_captain_of(team_id))
    or (select public.is_admin())
  );

-- Open spots on a team: { open, starters_open, subs_open }.
create function public.team_open_spots(p_team_id uuid)
returns table (open int, starters_open int, subs_open int)
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(s.max_roster - count(tm.id), 0)::int,
         greatest(s.max_starters - count(tm.id) filter (where tm.role = 'starter'), 0)::int,
         greatest(s.max_subs - count(tm.id) filter (where tm.role = 'sub'), 0)::int
    from public.teams t
    join public.seasons s on s.id = t.season_id
    left join public.team_members tm
      on tm.team_id = t.id and tm.left_at is null and not tm.is_emergency
   where t.id = p_team_id
   group by s.max_roster, s.max_starters, s.max_subs;
$$;

create function public.invite_player(
  p_team_id uuid,
  p_user_id uuid,
  p_role public.member_role default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_team public.teams;
  v_season public.seasons;
  v_spots record;
  v_id uuid;
begin
  select * into v_team from public.teams where id = p_team_id;
  if v_team.id is null then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if not public.is_captain_of(p_team_id) then
    raise exception 'Only the captain or co-captain can invite players' using errcode = '42501';
  end if;
  if v_team.status = 'removed' then
    raise exception 'This team has been removed from the league' using errcode = 'P0001';
  end if;
  select * into v_season from public.seasons where id = v_team.season_id;
  if v_season.status = 'complete' then
    raise exception 'This season is over' using errcode = 'P0001';
  end if;
  if v_season.roster_lock_at is not null and now() >= v_season.roster_lock_at then
    raise exception 'Rosters are locked for this season' using errcode = 'P0001';
  end if;
  if p_user_id = v_uid then
    raise exception 'You cannot invite yourself' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id and banned_until > now()) then
    raise exception 'This player is banned' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.team_members tm
     where tm.season_id = v_team.season_id and tm.user_id = p_user_id
       and tm.left_at is null and not tm.is_emergency
  ) then
    raise exception 'This player is already on a team this season' using errcode = 'P0001';
  end if;

  select * into v_spots from public.team_open_spots(p_team_id);
  if v_spots.open <= 0 then
    raise exception 'Your roster is full (max % players)', v_season.max_roster using errcode = 'P0001';
  end if;
  if p_role = 'starter' and v_spots.starters_open <= 0 then
    raise exception 'Starter spots are full (max %)', v_season.max_starters using errcode = 'P0001';
  end if;
  if p_role = 'sub' and v_spots.subs_open <= 0 then
    raise exception 'Sub spots are full (max %)', v_season.max_subs using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.team_invites
     where team_id = p_team_id and user_id = p_user_id and status = 'pending' and expires_at > now()
  ) then
    raise exception 'This player already has a pending invite from your team' using errcode = 'P0001';
  end if;
  update public.team_invites set status = 'expired'
   where team_id = p_team_id and user_id = p_user_id and status = 'pending';

  insert into public.team_invites (team_id, user_id, invited_by, role)
  values (p_team_id, p_user_id, v_uid, p_role)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.respond_to_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.team_invites;
  v_team public.teams;
  v_spots record;
  v_role public.member_role;
begin
  select * into v_inv from public.team_invites where id = p_invite_id for update;
  if v_inv.id is null or v_inv.user_id is distinct from v_uid then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'This invite is no longer open' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    update public.team_invites set status = 'expired' where id = v_inv.id;
    return;
  end if;

  if not p_accept then
    update public.team_invites set status = 'declined', responded_at = now() where id = v_inv.id;
    return;
  end if;

  if not exists (
    select 1 from public.profiles
     where id = v_uid and age_confirmed_at is not null and activision_id is not null
  ) then
    raise exception 'Finish your profile (Activision ID and age confirmation) before joining a team'
      using errcode = 'P0001';
  end if;

  select * into v_team from public.teams where id = v_inv.team_id;
  select * into v_spots from public.team_open_spots(v_inv.team_id);
  v_role := coalesce(
    v_inv.role,
    case when v_spots.starters_open > 0 then 'starter'::public.member_role else 'sub'::public.member_role end
  );

  -- team_members_guard enforces roster size, role caps, one team per season, lock and change limits.
  insert into public.team_members (team_id, season_id, user_id, role)
  values (v_inv.team_id, v_team.season_id, v_uid, v_role);

  update public.team_invites set status = 'accepted', responded_at = now() where id = v_inv.id;

  -- Other pending invites for this season are void now.
  update public.team_invites i
     set status = 'cancelled', responded_at = now()
    from public.teams t
   where t.id = i.team_id and t.season_id = v_team.season_id
     and i.user_id = v_uid and i.status = 'pending' and i.id <> v_inv.id;
end;
$$;

create function public.cancel_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.team_invites;
begin
  select * into v_inv from public.team_invites where id = p_invite_id for update;
  if v_inv.id is null or not (public.is_captain_of(v_inv.team_id) or public.can_staff_team(v_inv.team_id)) then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'This invite is no longer open' using errcode = 'P0001';
  end if;
  update public.team_invites set status = 'cancelled', responded_at = now() where id = v_inv.id;
end;
$$;

-- Captain removes a player (not themselves; transfer the captaincy first).
create function public.remove_player(p_team_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows int;
begin
  if not (public.is_captain_of(p_team_id) or public.can_staff_team(p_team_id)) then
    raise exception 'Only the captain or co-captain can remove players' using errcode = '42501';
  end if;
  perform set_config('hal.roster_rpc', 'on', true);
  update public.team_members
     set left_at = now()
   where team_id = p_team_id and user_id = p_user_id and left_at is null and not is_emergency;
  get diagnostics v_rows = row_count;
  perform set_config('hal.roster_rpc', '', true);
  if v_rows = 0 then
    raise exception 'That player is not on this roster' using errcode = 'P0002';
  end if;
end;
$$;

-- Player leaves a team (the captain must transfer the captaincy first).
create function public.leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows int;
begin
  perform set_config('hal.roster_rpc', 'on', true);
  update public.team_members
     set left_at = now()
   where team_id = p_team_id and user_id = (select auth.uid()) and left_at is null and not is_emergency;
  get diagnostics v_rows = row_count;
  perform set_config('hal.roster_rpc', '', true);
  if v_rows = 0 then
    raise exception 'You are not on this team' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function
  public.team_open_spots(uuid),
  public.invite_player(uuid, uuid, public.member_role),
  public.respond_to_invite(uuid, boolean),
  public.cancel_invite(uuid),
  public.remove_player(uuid, uuid),
  public.leave_team(uuid)
  from public, anon;
grant execute on function
  public.team_open_spots(uuid),
  public.invite_player(uuid, uuid, public.member_role),
  public.respond_to_invite(uuid, boolean),
  public.cancel_invite(uuid),
  public.remove_player(uuid, uuid),
  public.leave_team(uuid)
  to authenticated, service_role;
revoke execute on function public.team_members_sync_free_agent() from public, anon, authenticated;
