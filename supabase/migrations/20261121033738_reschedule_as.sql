-- Step 20: /reschedule in Discord. One set of rules for the site and the bot:
-- request_reschedule_as / respond_reschedule_as take the acting HAL user explicitly (the bot
-- calls them with the service role) and enforce every rule themselves; the site's
-- request_reschedule / respond_reschedule now wrap them with auth.uid().
--
-- Rules: captain or co-captain of a team in the match; at least 24h before the default time;
-- the new time is in the future, in the same league week (Monday to Sunday 11:59 PM in the
-- season's time zone) and not the current time; one pending request per match.

create function public.request_reschedule_as(p_actor uuid, p_match_id uuid, p_proposed_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  v_tz text;
  v_week_start timestamp;
  v_team uuid;
  v_id uuid;
  v_prev text := coalesce(current_setting('hal.internal', true), '');
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  select t.id into v_team from public.teams t
   where t.id in (m.home_team_id, m.away_team_id) and public.is_captain_of_for(p_actor, t.id)
   limit 1;
  if v_team is null then
    raise exception 'Only a captain or co-captain in this match can request a reschedule' using errcode = '42501';
  end if;
  if m.status not in ('scheduled', 'checkin_open') then
    raise exception 'This match can no longer be rescheduled' using errcode = 'P0001';
  end if;
  if now() > m.default_at - interval '24 hours' then
    raise exception 'Too late: reschedules must be agreed at least 24 hours before the default time' using errcode = 'P0001';
  end if;
  select timezone into v_tz from public.seasons where id = m.season_id;
  v_week_start := date_trunc('week', m.default_at at time zone v_tz);
  if p_proposed_at < (v_week_start at time zone v_tz) or p_proposed_at >= ((v_week_start + interval '7 days') at time zone v_tz) then
    raise exception 'The new time must be in the same league week, by Sunday 11:59 PM ET' using errcode = 'P0001';
  end if;
  if p_proposed_at <= now() then
    raise exception 'The new time must be in the future' using errcode = 'P0001';
  end if;
  if p_proposed_at = m.scheduled_at then
    raise exception 'That is already the match time' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reschedule_requests where match_id = p_match_id and status = 'pending') then
    raise exception 'There is already a pending request for this match. Answer or cancel it first.' using errcode = 'P0001';
  end if;

  perform set_config('hal.internal', 'on', true);
  insert into public.reschedule_requests (match_id, requested_by_team_id, requested_by, proposed_at)
  values (p_match_id, v_team, p_actor, p_proposed_at)
  returning id into v_id;
  perform set_config('hal.internal', v_prev, true);
  return v_id;
end;
$$;
revoke execute on function public.request_reschedule_as(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.request_reschedule_as(uuid, uuid, timestamptz) to service_role;

create function public.respond_reschedule_as(p_actor uuid, p_request_id uuid, p_accept boolean)
returns public.reschedule_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reschedule_requests;
  m public.matches;
  v_other uuid;
  v_status public.reschedule_status := case when p_accept then 'accepted'::public.reschedule_status else 'declined'::public.reschedule_status end;
  v_prev text := coalesce(current_setting('hal.internal', true), '');
begin
  select * into r from public.reschedule_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  select * into m from public.matches where id = r.match_id;
  v_other := case when r.requested_by_team_id = m.home_team_id then m.away_team_id else m.home_team_id end;
  if not public.is_captain_of_for(p_actor, v_other) then
    raise exception 'Only the other team''s captain or co-captain can answer this request' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'This request was already %', r.status using errcode = 'P0001';
  end if;
  if p_accept then
    if now() > m.default_at - interval '24 hours' then
      raise exception 'Too late: reschedules must be agreed at least 24 hours before the default time' using errcode = 'P0001';
    end if;
    if r.proposed_at <= now() then
      raise exception 'The proposed time has already passed' using errcode = 'P0001';
    end if;
  end if;

  perform set_config('hal.internal', 'on', true);
  update public.reschedule_requests
     set status = v_status, responded_by = p_actor, responded_at = now()
   where id = p_request_id;
  perform set_config('hal.internal', v_prev, true);
  return v_status;
end;
$$;
revoke execute on function public.respond_reschedule_as(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.respond_reschedule_as(uuid, uuid, boolean) to service_role;

-- The site's functions now share the same core.
create or replace function public.request_reschedule(p_match_id uuid, p_proposed_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to request a reschedule' using errcode = '42501';
  end if;
  return public.request_reschedule_as((select auth.uid()), p_match_id, p_proposed_at);
end;
$$;

create or replace function public.respond_reschedule(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to answer a reschedule' using errcode = '42501';
  end if;
  perform public.respond_reschedule_as((select auth.uid()), p_request_id, p_accept);
end;
$$;

-- Matches a captain can still reschedule (for the bot's autocomplete).
create function public.reschedulable_matches_for(p_actor uuid)
returns table (match_id uuid, week smallint, default_at timestamptz, scheduled_at timestamptz, timezone text, opponent_tag text, opponent_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.week, m.default_at, m.scheduled_at, s.timezone,
         case when m.home_team_id = t.id then at.tag else ht.tag end,
         case when m.home_team_id = t.id then at.name else ht.name end
    from public.teams t
    join public.matches m on t.id in (m.home_team_id, m.away_team_id)
    join public.seasons s on s.id = m.season_id
    join public.teams ht on ht.id = m.home_team_id
    join public.teams at on at.id = m.away_team_id
   where public.is_captain_of_for(p_actor, t.id)
     and m.status in ('scheduled', 'checkin_open')
     and now() <= m.default_at - interval '24 hours'
     and s.status in ('signups', 'regular', 'playoffs')
   order by m.default_at
   limit 25;
$$;
revoke execute on function public.reschedulable_matches_for(uuid) from public, anon, authenticated;
grant execute on function public.reschedulable_matches_for(uuid) to service_role;
