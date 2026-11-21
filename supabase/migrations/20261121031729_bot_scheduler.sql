-- Step 18: reminders, check-in and results announcements.
--
-- discord-scheduler (Edge Function) is called every 5 minutes by pg_cron. It posts reminders and
-- check-in buttons, warns about missing check-ins, and drains notifications_outbox. bot_events
-- records every post (claimed before posting), so nothing is ever sent twice.
--
-- Check-in goes through check_in_as(user, match, players) for both the bot and the site (the site
-- calls check_in(match, players)). It enforces captaincy, the window (T-15 minutes to T+30) and
-- eligibility (rostered 24h before the match, or an approved emergency sub; not banned).

-- ---------------------------------------------------------------------------
-- Bot events
-- ---------------------------------------------------------------------------
create table public.bot_events (
  id bigint generated always as identity primary key,
  match_id uuid references public.matches (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  kind text not null,
  discord_channel_id text,
  discord_message_id text,
  sent_at timestamptz not null default now()
);
create unique index bot_events_once_idx
  on public.bot_events (match_id, kind, coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index bot_events_team_idx on public.bot_events (team_id);
alter table public.bot_events enable row level security;
revoke all on public.bot_events from anon, authenticated;
-- No policies: service role only.

-- ---------------------------------------------------------------------------
-- Check-in
-- ---------------------------------------------------------------------------
-- Players who can be checked in for a team in a match.
create function public.eligible_checkin_players(p_match_id uuid, p_team_id uuid)
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
     order by tm.is_emergency, tm.role, coalesce(p.discord_username, p.activision_id);
end;
$$;
revoke execute on function public.eligible_checkin_players(uuid, uuid) from public, anon;
grant execute on function public.eligible_checkin_players(uuid, uuid) to authenticated, service_role;

create function public.check_in_as(p_user_id uuid, p_match_id uuid, p_player_ids uuid[], p_source public.submission_source default 'site')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  v_team uuid;
  v_prev text := coalesce(current_setting('hal.internal', true), '');
  v_names text[];
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  select t.id into v_team from public.teams t
   where t.id in (m.home_team_id, m.away_team_id) and p_user_id in (t.captain_id, t.co_captain_id)
   limit 1;
  if v_team is null then
    raise exception 'Only your captain or co-captain can check in' using errcode = '42501';
  end if;
  if m.status not in ('scheduled', 'checkin_open') then
    raise exception 'Check-in is closed for this match' using errcode = 'P0001';
  end if;
  if now() < m.scheduled_at - interval '15 minutes' then
    raise exception 'Check-in opens 15 minutes before the match' using errcode = 'P0001';
  end if;
  if now() > m.scheduled_at + interval '30 minutes' then
    raise exception 'Check-in has closed (30 minutes late is a series forfeit)' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_player_ids), 0) <> 4 or (select count(distinct x) from unnest(p_player_ids) x) <> 4 then
    raise exception 'Check in exactly 4 different players' using errcode = 'P0001';
  end if;
  if (select count(*) from public.eligible_checkin_players(p_match_id, v_team) e where e.user_id = any (p_player_ids)) <> 4 then
    raise exception 'All 4 players must be eligible: on the roster 24 hours before the match (or an approved emergency sub) and not banned'
      using errcode = 'P0001';
  end if;

  perform set_config('hal.internal', 'on', true);
  insert into public.checkins (match_id, team_id, captain_id, player_ids, checked_in_at, source)
  values (p_match_id, v_team, p_user_id, p_player_ids, now(), p_source)
  on conflict (match_id, team_id) do update
     set captain_id = excluded.captain_id, player_ids = excluded.player_ids,
         checked_in_at = excluded.checked_in_at, source = excluded.source;
  update public.matches set status = 'checkin_open' where id = p_match_id and status = 'scheduled';
  perform set_config('hal.internal', v_prev, true);

  select array_agg(coalesce(p.discord_username, p.activision_id, 'Player') order by array_position(p_player_ids, p.id))
    into v_names from public.profiles p where p.id = any (p_player_ids);
  perform public.enqueue_notification('checked_in', jsonb_build_object('match_id', p_match_id, 'team_id', v_team));
  return jsonb_build_object('team_id', v_team, 'players', to_jsonb(v_names), 'checked_in_at', now());
end;
$$;
revoke execute on function public.check_in_as(uuid, uuid, uuid[], public.submission_source) from public, anon, authenticated;
grant execute on function public.check_in_as(uuid, uuid, uuid[], public.submission_source) to service_role;

-- The site's check-in (the bot calls check_in_as with the Discord user's HAL id).
create function public.check_in(p_match_id uuid, p_player_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to check in' using errcode = '42501';
  end if;
  return public.check_in_as((select auth.uid()), p_match_id, p_player_ids, 'site');
end;
$$;
revoke execute on function public.check_in(uuid, uuid[]) from public, anon;
grant execute on function public.check_in(uuid, uuid[]) to authenticated;

-- Direct writes to checkins are no longer needed by captains.
drop policy "captains check in their team" on public.checkins;

-- ---------------------------------------------------------------------------
-- Results go to the outbox when a match is settled
-- ---------------------------------------------------------------------------
create function public.matches_result_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('confirmed', 'forfeit')
     and (old.status is distinct from new.status
          or old.home_series is distinct from new.home_series
          or old.away_series is distinct from new.away_series
          or old.forfeit_team_id is distinct from new.forfeit_team_id) then
    perform public.enqueue_notification('match_result', jsonb_build_object('match_id', new.id, 'status', new.status));
  end if;
  return null;
end;
$$;
revoke execute on function public.matches_result_notify() from public, anon, authenticated;

create trigger matches_result_notify after update on public.matches
  for each row execute function public.matches_result_notify();

-- ---------------------------------------------------------------------------
-- Scheduler tick (pg_cron every 5 minutes). Reuses the discord-sync URL and secret from Vault.
-- ---------------------------------------------------------------------------
create function public.discord_scheduler_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'discord_sync_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'discord_sync_secret' limit 1;
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := regexp_replace(v_url, 'discord-sync/?$', 'discord-scheduler'),
    body := jsonb_build_object('action', 'tick'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hal-sync-secret', v_secret),
    timeout_milliseconds := 30000
  );
end;
$$;
revoke execute on function public.discord_scheduler_tick() from public, anon, authenticated;

select cron.schedule('hal-discord-scheduler', '*/5 * * * *', 'select public.discord_scheduler_tick()');
