-- Emergency subs need the free agent's consent (rule 4.3–4.4):
--   1. A captain requests a free agent for one of their matches (site; the insert below).
--   2. The free agent accepts or declines (site or the Discord DM buttons).
--   3. Only then can an admin approve. Approval adds them for that match only (unchanged).
-- Each step queues a notification for the bot: DM to the player, post in #admin-only once
-- accepted, and a note in the captain's team channel when it's declined or reviewed.

alter table public.roster_requests
  add column player_confirmed_at timestamptz,
  add column player_declined_at timestamptz;

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
  if new.type = 'emergency_sub' and new.status = 'approved' and old.status = 'pending'
     and new.player_confirmed_at is null then
    raise exception 'The player hasn''t accepted yet' using errcode = 'P0001';
  end if;
  if new.status <> old.status and not public.is_internal() then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

-- The player answers. _as is for the bot (service role passes the actor); the site uses the wrapper.
create function public.respond_emergency_sub_as(p_actor uuid, p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.roster_requests;
  v_match public.matches;
begin
  select * into r from public.roster_requests where id = p_request_id for update;
  if not found or r.type <> 'emergency_sub' then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if r.user_id is distinct from p_actor then
    raise exception 'This request is for another player' using errcode = '42501';
  end if;
  if r.status <> 'pending' or r.player_declined_at is not null then
    raise exception 'This request is closed' using errcode = 'P0001';
  end if;
  if r.player_confirmed_at is not null then
    if p_accept then
      return jsonb_build_object('status', 'accepted', 'already', true);
    end if;
  end if;
  select * into v_match from public.matches where id = r.match_id;
  if v_match.status not in ('scheduled', 'checkin_open', 'live') then
    raise exception 'This match is over' using errcode = 'P0001';
  end if;

  perform set_config('hal.esub_player', 'on', true);
  if p_accept then
    if exists (
      select 1 from public.team_members tm
       where tm.season_id = v_match.season_id and tm.user_id = p_actor
         and tm.left_at is null and not tm.is_emergency
    ) then
      perform set_config('hal.esub_player', '', true);
      raise exception 'You joined a team, so you can''t be an emergency sub' using errcode = 'P0001';
    end if;
    update public.roster_requests set player_confirmed_at = now() where id = r.id;
  else
    -- Declining closes the request (no reviewer: hal.internal keeps reviewed_by empty).
    perform set_config('hal.internal', 'on', true);
    update public.roster_requests
       set player_declined_at = now(), player_confirmed_at = null, status = 'denied'
     where id = r.id;
    perform set_config('hal.internal', '', true);
  end if;
  perform set_config('hal.esub_player', '', true);
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end;
$$;
revoke execute on function public.respond_emergency_sub_as(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.respond_emergency_sub_as(uuid, uuid, boolean) to service_role;

create function public.respond_emergency_sub(p_request_id uuid, p_accept boolean)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.respond_emergency_sub_as((select auth.uid()), p_request_id, p_accept);
$$;
revoke execute on function public.respond_emergency_sub(uuid, boolean) from public, anon;
grant execute on function public.respond_emergency_sub(uuid, boolean) to authenticated;

-- Notifications for the bot.
create function public.roster_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type <> 'emergency_sub' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform public.enqueue_notification('emergency_sub_requested', jsonb_build_object('request_id', new.id));
  elsif new.player_declined_at is not null and old.player_declined_at is null then
    perform public.enqueue_notification('emergency_sub_declined', jsonb_build_object('request_id', new.id));
  elsif new.player_confirmed_at is not null and old.player_confirmed_at is null then
    perform public.enqueue_notification('emergency_sub_accepted', jsonb_build_object('request_id', new.id));
  elsif new.status <> old.status then
    perform public.enqueue_notification('emergency_sub_reviewed', jsonb_build_object('request_id', new.id));
  end if;
  return new;
end;
$$;
revoke execute on function public.roster_requests_notify() from public, anon, authenticated;
create trigger roster_requests_notify after insert or update on public.roster_requests
  for each row execute function public.roster_requests_notify();

-- Admins only need to act on emergency subs the player has accepted.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week_start timestamptz := (date_trunc('week', now() at time zone 'America/New_York')) at time zone 'America/New_York';
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'open_mismatch_matches', (
      select count(distinct mm.match_id) from public.stat_mismatches s
        join public.match_maps mm on mm.id = s.match_map_id where s.resolved_at is null),
    'open_mismatch_fields', (select count(*) from public.stat_mismatches where resolved_at is null),
    'open_disputes', (select count(*) from public.disputes where status = 'open'),
    'pending_roster_requests', (
      select count(*) from public.roster_requests
       where status = 'pending' and (type <> 'emergency_sub' or player_confirmed_at is not null)),
    'pending_teams', (
      select count(*) from public.teams t join public.seasons s on s.id = t.season_id
       where t.status = 'pending' and s.status in ('signups', 'regular', 'playoffs')),
    'unreported_past_24h', (
      select count(*) from public.matches
       where status in ('scheduled', 'checkin_open', 'live', 'awaiting_reports')
         and scheduled_at < now() - interval '24 hours'),
    'matches_this_week', (
      select count(*) from public.matches
       where scheduled_at >= v_week_start and scheduled_at < v_week_start + interval '7 days'),
    'week_start', v_week_start
  );
end;
$$;
