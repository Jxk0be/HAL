-- Emergency subs for late dropouts (rule 4.3, as changed by the owner):
--   - The captain marks which players are out for a match (match_absences).
--   - A request is allowed when fewer than 4 players are available: eligible (rostered 24h before
--     the match) minus those marked out.
--   - At most 2 emergency subs per team per match: at most 2 open or approved requests, and an
--     admin can approve only as many as the team is short (and never more than 2).
--   - Players marked out can't be checked in for that match. The captain can take a player off
--     the out list only while the team has no approved emergency sub for the match.

create table public.match_absences (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text check (reason is null or length(reason) <= 200),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);
create index match_absences_team_idx on public.match_absences (team_id, match_id);
create index match_absences_user_idx on public.match_absences (user_id);
create index match_absences_created_by_idx on public.match_absences (created_by);
create trigger audit_staff_change after insert or update or delete on public.match_absences
  for each row execute function public.audit_staff_change();

-- Players available for a team in a match: eligible roster players not marked out.
create function public.available_players(p_match_id uuid, p_team_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.team_members tm
    join public.matches m on m.id = p_match_id
   where tm.team_id = p_team_id and tm.left_at is null and not tm.is_emergency
     and tm.joined_at <= m.scheduled_at - interval '24 hours'
     and not exists (select 1 from public.match_absences a where a.match_id = p_match_id and a.user_id = tm.user_id);
$$;
revoke execute on function public.available_players(uuid, uuid) from public, anon;
grant execute on function public.available_players(uuid, uuid) to authenticated, service_role;

create function public.match_absences_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
  v_row public.match_absences := coalesce(new, old);
begin
  if public.is_internal() then
    return coalesce(new, old);
  end if;
  select * into v_match from public.matches where id = v_row.match_id;
  if v_match.id is null or v_row.team_id not in (v_match.home_team_id, v_match.away_team_id) then
    raise exception 'That team isn''t in this match' using errcode = 'P0001';
  end if;
  if not (public.is_captain_of(v_row.team_id) or public.can_staff_match(v_row.match_id)) then
    raise exception 'Only the captain or co-captain can mark players out' using errcode = '42501';
  end if;
  if v_match.status not in ('scheduled', 'checkin_open', 'live') then
    raise exception 'This match is over' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.team_members tm
       where tm.team_id = new.team_id and tm.user_id = new.user_id and tm.left_at is null and not tm.is_emergency
    ) then
      raise exception 'Only players on the roster can be marked out' using errcode = 'P0001';
    end if;
    new.created_by := (select auth.uid());
    return new;
  end if;
  if tg_op = 'DELETE' and exists (
    select 1 from public.roster_requests r
     where r.type = 'emergency_sub' and r.match_id = old.match_id and r.team_id = old.team_id and r.status = 'approved'
  ) then
    raise exception 'An emergency sub is already approved for this match, so players marked out stay out' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.match_absences_guard() from public, anon, authenticated;
create trigger match_absences_guard before insert or update or delete on public.match_absences
  for each row execute function public.match_absences_guard();

alter table public.match_absences enable row level security;
create policy "teams in the match and staff read absences" on public.match_absences
  for select to authenticated
  using ((select public.is_party_to_match(match_id)) or (select public.is_admin()));
create policy "captains mark players out" on public.match_absences
  for insert to authenticated with check ((select public.is_captain_of(team_id)));
create policy "captains clear players marked out" on public.match_absences
  for delete to authenticated using ((select public.is_captain_of(team_id)));

-- Request guard: available instead of eligible, and the 2-sub cap. Approval: never more subs than
-- the team is short.
create or replace function public.roster_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_available int;
  v_match public.matches;
  v_player_step boolean := coalesce(current_setting('hal.esub_player', true), '') = 'on';
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
    new.player_confirmed_at := null;
    new.player_declined_at := null;

    select * into v_match from public.matches where id = new.match_id;
    if v_match.id is null or new.team_id not in (v_match.home_team_id, v_match.away_team_id) then
      raise exception 'An emergency sub request must name one of this team''s matches' using errcode = 'P0001';
    end if;
    if v_match.status not in ('scheduled', 'checkin_open', 'live') then
      raise exception 'This match is over' using errcode = 'P0001';
    end if;
    v_available := public.available_players(new.match_id, new.team_id);
    if v_available >= 4 then
      raise exception 'You have 4 players available. Mark who can''t play first: emergency subs are only for teams with fewer than 4 available'
        using errcode = 'P0001';
    end if;
    if (select count(*) from public.roster_requests r
         where r.type = 'emergency_sub' and r.match_id = new.match_id and r.team_id = new.team_id
           and r.player_declined_at is null and r.status in ('pending', 'approved')) >= 2 then
      raise exception 'A team can have at most 2 emergency subs per match (withdraw a request to ask someone else)'
        using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.team_members tm
       where tm.season_id = v_team.season_id and tm.user_id = new.user_id
         and tm.left_at is null and not tm.is_emergency
    ) then
      raise exception 'Emergency subs must be free agents' using errcode = 'P0001';
    end if;
    if not public.is_profile_complete(new.user_id) then
      raise exception 'That player hasn''t finished their HAL profile (rule 2.5)' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.profiles p where p.id = new.user_id and p.banned_until > now()) then
      raise exception 'That player is banned' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.roster_requests r
       where r.type = 'emergency_sub' and r.match_id = new.match_id and r.user_id = new.user_id
         and r.status in ('pending', 'approved')
    ) then
      raise exception 'That player already has a request for this match' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE (player answer or staff review)
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'This request has already been reviewed' using errcode = 'P0001';
  end if;
  if new.team_id <> old.team_id or new.user_id <> old.user_id or new.type <> old.type
     or new.match_id is distinct from old.match_id or new.requested_by <> old.requested_by then
    raise exception 'Only the status and note of a request can change' using errcode = 'P0001';
  end if;
  if not v_player_step
     and (new.player_confirmed_at is distinct from old.player_confirmed_at
          or new.player_declined_at is distinct from old.player_declined_at) then
    raise exception 'Only the player can accept or decline' using errcode = '42501';
  end if;
  if new.type = 'emergency_sub' and new.status = 'approved' and old.status = 'pending' then
    if new.player_confirmed_at is null then
      raise exception 'The player hasn''t accepted yet' using errcode = 'P0001';
    end if;
    if (select count(*) from public.roster_requests r
         where r.type = 'emergency_sub' and r.match_id = new.match_id and r.team_id = new.team_id
           and r.status = 'approved')
       >= least(2, 4 - public.available_players(new.match_id, new.team_id)) then
      raise exception 'This team already has as many emergency subs approved as it needs' using errcode = 'P0001';
    end if;
  end if;
  if new.status <> old.status and not public.is_internal() then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

-- One call from the site: mark who's out (adds to the list), then request the sub.
create function public.request_emergency_sub(
  p_match_id uuid,
  p_team_id uuid,
  p_user_id uuid,
  p_out_ids uuid[] default '{}',
  p_reason text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_captain_of(p_team_id) then
    raise exception 'Only the captain or co-captain can request an emergency sub' using errcode = '42501';
  end if;
  insert into public.match_absences (match_id, team_id, user_id, reason)
  select p_match_id, p_team_id, x, nullif(btrim(p_reason), '')
    from unnest(coalesce(p_out_ids, '{}')) as x
  on conflict (match_id, user_id) do update set reason = coalesce(excluded.reason, public.match_absences.reason);

  insert into public.roster_requests (team_id, user_id, type, match_id, note, requested_by)
  values (p_team_id, p_user_id, 'emergency_sub', p_match_id, nullif(btrim(p_note), ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.request_emergency_sub(uuid, uuid, uuid, uuid[], text, text) from public, anon;
grant execute on function public.request_emergency_sub(uuid, uuid, uuid, uuid[], text, text) to authenticated;

-- Check-in: players marked out aren't eligible for that match.
create or replace function public.eligible_checkin_players(p_match_id uuid, p_team_id uuid)
returns table (user_id uuid, name text, is_emergency boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  select * into m from public.matches where id = p_match_id;
  if not found or p_team_id not in (m.home_team_id, m.away_team_id) then
    return;
  end if;
  -- Signed-in callers must be on one of the teams or staff; the bot (service role) has no uid.
  if (select auth.uid()) is not null and not (public.is_party_to_match(p_match_id) or public.is_admin()) then
    raise exception 'Only the teams in this match and staff can see this' using errcode = '42501';
  end if;
  return query
    select tm.user_id, coalesce(p.discord_username, p.activision_id, 'Player'), tm.is_emergency
      from public.team_members tm
      join public.profiles p on p.id = tm.user_id
     where tm.team_id = p_team_id
       and tm.left_at is null
       and (p.banned_until is null or p.banned_until <= now())
       and (
         (not tm.is_emergency and tm.joined_at <= m.scheduled_at - interval '24 hours')
         or (tm.is_emergency and tm.emergency_match_id = p_match_id)
       )
       and not exists (select 1 from public.match_absences a where a.match_id = p_match_id and a.user_id = tm.user_id)
     order by tm.is_emergency, tm.role, coalesce(p.discord_username, p.activision_id);
end;
$$;

create or replace function public.checkins_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
  v_ok int;
  v_staff boolean;
begin
  select * into v_match from public.matches where id = new.match_id;
  v_staff := public.is_internal() or public.can_staff_match(new.match_id);

  if (select count(distinct p) from unnest(new.player_ids) p) <> 4 then
    raise exception 'Check in exactly 4 different players' using errcode = 'P0001';
  end if;

  -- Every player: active on this team (non-emergency, on the roster 24h before the match)
  -- or an approved emergency sub for this match, and not marked out for this match.
  select count(distinct tm.user_id) into v_ok
    from public.team_members tm
   where tm.team_id = new.team_id
     and tm.user_id = any (new.player_ids)
     and tm.left_at is null
     and (
       (not tm.is_emergency and tm.joined_at <= v_match.scheduled_at - interval '24 hours')
       or (tm.is_emergency and tm.emergency_match_id = new.match_id)
     )
     and not exists (select 1 from public.match_absences a where a.match_id = new.match_id and a.user_id = tm.user_id);
  if v_ok <> 4 then
    raise exception 'All 4 players must be on the roster at least 24 hours before the match (or approved emergency subs) and not marked out'
      using errcode = 'P0001';
  end if;

  if not v_staff then
    new.captain_id := (select auth.uid());
    if v_match.status not in ('scheduled', 'checkin_open') then
      raise exception 'Check-in is closed for this match' using errcode = 'P0001';
    end if;
    if now() < v_match.scheduled_at - interval '15 minutes' then
      raise exception 'Check-in opens 15 minutes before the match' using errcode = 'P0001';
    end if;
    if now() > v_match.scheduled_at + interval '30 minutes' then
      raise exception 'Check-in has closed (30 minutes late is a series forfeit)' using errcode = 'P0001';
    end if;
    new.checked_in_at := now();
  end if;
  return new;
end;
$$;
