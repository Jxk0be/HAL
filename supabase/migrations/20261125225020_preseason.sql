-- Preseason matches (optional, cast).
--  1. An admin sends invites: every approved team gets a preseason_interest row and a Discord
--     invite in its team channel. Captains / co-captains answer on My team or with the buttons.
--  2. An admin generates the pairings: interested teams in a random circle, so each team plays
--     2 matches (1 when only 2 teams said yes). No times yet; the bot opens a shared
--     PRESEASON channel for each pair.
--  3. A captain proposes a time, the other team's captain accepts. Accepting creates (or moves) a
--     real match with stage 'preseason' and week 0, so check-in, full reporting, disputes and
--     casting work as usual. Two matches may never be within 2 hours of each other (casting).
-- Standings, leaderboards, stats views and forfeit counts ignore preseason.

-- ---- Schema ---------------------------------------------------------------------------------
alter table public.seasons
  add column preseason_invites_at timestamptz,
  add column preseason_generated_at timestamptz;

alter table public.matches drop constraint matches_week_check;
alter table public.matches add constraint matches_week_check
  check (case when stage = 'preseason' then week = 0 else week >= 1 end);

create table public.preseason_interest (
  team_id uuid primary key references public.teams (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  interested boolean,                         -- null: invited, no answer yet
  invited_at timestamptz not null default now(),
  responded_by uuid references public.profiles (id) on delete set null,
  responded_at timestamptz,
  discord_channel_id text,                    -- the invite post in the team channel
  discord_message_id text
);
create index preseason_interest_season_idx on public.preseason_interest (season_id);
create index preseason_interest_responded_by_idx on public.preseason_interest (responded_by);

create table public.preseason_pairings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  home_team_id uuid not null references public.teams (id) on delete cascade,
  away_team_id uuid not null references public.teams (id) on delete cascade,
  status text not null default 'unscheduled' check (status in ('unscheduled', 'scheduled', 'cancelled')),
  match_id uuid unique references public.matches (id) on delete set null,
  discord_channel_id text,                    -- the shared PRESEASON channel
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);
create index preseason_pairings_season_idx on public.preseason_pairings (season_id);
create index preseason_pairings_home_idx on public.preseason_pairings (home_team_id);
create index preseason_pairings_away_idx on public.preseason_pairings (away_team_id);
create trigger set_updated_at before update on public.preseason_pairings
  for each row execute function public.set_updated_at();

create table public.preseason_proposals (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references public.preseason_pairings (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,     -- the proposing team
  proposed_by uuid not null references public.profiles (id) on delete cascade,
  proposed_at timestamptz not null,
  status public.reschedule_status not null default 'pending',
  responded_by uuid references public.profiles (id) on delete set null,
  responded_at timestamptz,
  discord_channel_id text,
  discord_message_id text,
  created_at timestamptz not null default now()
);
create unique index preseason_proposals_one_pending on public.preseason_proposals (pairing_id) where status = 'pending';
create index preseason_proposals_team_idx on public.preseason_proposals (team_id);
create index preseason_proposals_proposed_by_idx on public.preseason_proposals (proposed_by);
create index preseason_proposals_responded_by_idx on public.preseason_proposals (responded_by);

-- ---- RLS: reads only; every write goes through the functions below ------------------------
alter table public.preseason_interest enable row level security;
alter table public.preseason_pairings enable row level security;
alter table public.preseason_proposals enable row level security;

revoke insert, update, delete, truncate on public.preseason_interest, public.preseason_pairings, public.preseason_proposals from anon, authenticated;
revoke all on public.preseason_interest from anon;

create policy "admins and the team's captains read preseason interest" on public.preseason_interest
  for select to authenticated
  using ((select public.is_admin()) or (select public.is_captain_of(team_id)));
create policy "preseason pairings are public" on public.preseason_pairings
  for select to anon, authenticated using (true);
create policy "preseason proposals are public" on public.preseason_proposals
  for select to anon, authenticated using (true);

-- ---- Helpers ---------------------------------------------------------------------------------
/** A readable reason when a match at p_at would be within 2 hours of another match this season. */
create or replace function public.preseason_conflict(p_season_id uuid, p_at timestamptz, p_ignore_match uuid default null)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'That time is too close to ' || h.tag || ' vs ' || a.tag || ' at ' ||
         to_char(m.scheduled_at at time zone s.timezone, 'Dy Mon FMDD, FMHH12:MI AM') || ' ET. ' ||
         'Matches need 2 hours to themselves so every one can be cast. Pick another time.'
    from public.matches m
    join public.seasons s on s.id = m.season_id
    join public.teams h on h.id = m.home_team_id
    join public.teams a on a.id = m.away_team_id
   where m.season_id = p_season_id
     and m.status <> 'cancelled'
     and m.id is distinct from p_ignore_match
     and m.scheduled_at > p_at - interval '2 hours'
     and m.scheduled_at < p_at + interval '2 hours'
   order by m.scheduled_at
   limit 1;
$$;

-- ---- Invites -----------------------------------------------------------------------------------
create or replace function public.preseason_send_invites(p_season_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  v_team uuid;
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can send preseason invites' using errcode = '42501';
  end if;
  select * into s from public.seasons where id = p_season_id for update;
  if not found then
    raise exception 'Season not found' using errcode = 'P0002';
  end if;
  if s.status <> 'signups' then
    raise exception 'Preseason invites go out while signups are open.' using errcode = 'P0001';
  end if;
  if s.preseason_generated_at is not null then
    raise exception 'The preseason schedule is already made.' using errcode = 'P0001';
  end if;

  update public.seasons set preseason_invites_at = coalesce(preseason_invites_at, now()) where id = p_season_id;

  for v_team in
    select t.id from public.teams t
     where t.season_id = p_season_id and t.status = 'approved'
       and not exists (select 1 from public.preseason_interest i where i.team_id = t.id)
  loop
    insert into public.preseason_interest (team_id, season_id) values (v_team, p_season_id);
    perform public.enqueue_notification('preseason_invite', jsonb_build_object('team_id', v_team));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

/** Teams approved while invites are open get one too. */
create or replace function public.teams_preseason_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved'
     and exists (select 1 from public.seasons s
                  where s.id = new.season_id and s.preseason_invites_at is not null
                    and s.preseason_generated_at is null and s.status = 'signups') then
    insert into public.preseason_interest (team_id, season_id) values (new.id, new.season_id)
      on conflict (team_id) do nothing;
    if found then
      perform public.enqueue_notification('preseason_invite', jsonb_build_object('team_id', new.id));
    end if;
  end if;
  return new;
end;
$$;
create trigger teams_preseason_invite after update of status on public.teams
  for each row execute function public.teams_preseason_invite();

create or replace function public.preseason_set_interest_as(p_actor uuid, p_team_id uuid, p_interested boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.teams;
  s public.seasons;
begin
  select * into t from public.teams where id = p_team_id;
  if not found or not public.is_captain_of_for(p_actor, p_team_id) then
    raise exception 'Only the captain or co-captain can answer for the team' using errcode = '42501';
  end if;
  select * into s from public.seasons where id = t.season_id;
  if s.preseason_invites_at is null or not exists (select 1 from public.preseason_interest where team_id = p_team_id) then
    raise exception 'Preseason sign-up isn''t open for your team.' using errcode = 'P0001';
  end if;
  if s.preseason_generated_at is not null then
    raise exception 'The preseason schedule is already made, so answers are closed. Ask an admin if you need a change.' using errcode = 'P0001';
  end if;
  if t.status <> 'approved' then
    raise exception 'Only approved teams can play preseason matches.' using errcode = 'P0001';
  end if;
  update public.preseason_interest
     set interested = p_interested, responded_by = p_actor, responded_at = now()
   where team_id = p_team_id;
  perform public.enqueue_notification('preseason_invite', jsonb_build_object('team_id', p_team_id));
end;
$$;

create or replace function public.preseason_set_interest(p_team_id uuid, p_interested boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform public.preseason_set_interest_as((select auth.uid()), p_team_id, p_interested);
end;
$$;

-- ---- Pairings ----------------------------------------------------------------------------------
create or replace function public.preseason_generate(p_season_id uuid, p_replace boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.seasons;
  v_teams uuid[];
  v_n int;
  v_i int;
  v_id uuid;
  v_old record;
begin
  if not public.is_admin() then
    raise exception 'Only admins can make the preseason schedule' using errcode = '42501';
  end if;
  select * into s from public.seasons where id = p_season_id for update;
  if not found then
    raise exception 'Season not found' using errcode = 'P0002';
  end if;
  if s.preseason_invites_at is null then
    raise exception 'Send the preseason invites first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.preseason_pairings where season_id = p_season_id and status <> 'cancelled') then
    if not p_replace then
      raise exception 'A preseason schedule already exists. Use Replace to make a new one.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.preseason_pairings where season_id = p_season_id and status = 'scheduled') then
      raise exception 'Some preseason matches already have a time, so the schedule can''t be replaced. Cancel those first.' using errcode = 'P0001';
    end if;
  end if;

  select array_agg(t.id order by random()) into v_teams
    from public.preseason_interest i
    join public.teams t on t.id = i.team_id
   where i.season_id = p_season_id and i.interested and t.status = 'approved';
  v_n := coalesce(array_length(v_teams, 1), 0);
  if v_n < 2 then
    raise exception 'At least 2 teams need to say yes first (% so far).', v_n using errcode = 'P0001';
  end if;

  -- Replace: remove the old unscheduled pairings; the bot deletes their channels.
  for v_old in
    select id, discord_channel_id from public.preseason_pairings
     where season_id = p_season_id and status <> 'scheduled'
  loop
    if v_old.discord_channel_id is not null then
      perform public.enqueue_notification('preseason_channel_removed', jsonb_build_object('channel_id', v_old.discord_channel_id));
    end if;
    delete from public.preseason_pairings where id = v_old.id;
  end loop;

  -- A random circle: each team plays its two neighbours (2 matches each; just 1 match for 2 teams).
  for v_i in 1 .. case when v_n = 2 then 1 else v_n end loop
    insert into public.preseason_pairings (season_id, home_team_id, away_team_id)
    values (p_season_id, v_teams[v_i], v_teams[v_i % v_n + 1])
    returning id into v_id;
    perform public.enqueue_notification('preseason_pairing', jsonb_build_object('pairing_id', v_id));
  end loop;

  update public.seasons set preseason_generated_at = now() where id = p_season_id;
  insert into public.audit_log (actor_id, actor_role, action, table_name, row_id, new_data)
  values ((select auth.uid()), 'admin', 'generated', 'seasons', p_season_id::text,
          jsonb_build_object('name', format('Preseason schedule: %s matches for %s teams', case when v_n = 2 then 1 else v_n end, v_n)));
  return case when v_n = 2 then 1 else v_n end;
end;
$$;

create or replace function public.preseason_cancel_pairing(p_pairing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.preseason_pairings;
begin
  if not public.is_admin() then
    raise exception 'Only admins can cancel preseason matches' using errcode = '42501';
  end if;
  select * into pr from public.preseason_pairings where id = p_pairing_id for update;
  if not found then
    raise exception 'Preseason match not found' using errcode = 'P0002';
  end if;
  if pr.status = 'cancelled' then
    return;
  end if;
  if pr.match_id is not null then
    if exists (select 1 from public.matches where id = pr.match_id and status not in ('scheduled', 'checkin_open', 'cancelled')) then
      raise exception 'This match has already started or finished.' using errcode = 'P0001';
    end if;
    update public.matches set status = 'cancelled' where id = pr.match_id;
  end if;
  update public.preseason_proposals set status = 'cancelled' where pairing_id = p_pairing_id and status = 'pending';
  update public.preseason_pairings set status = 'cancelled' where id = p_pairing_id;
  perform public.enqueue_notification('preseason_pairing_cancelled', jsonb_build_object('pairing_id', p_pairing_id));
end;
$$;

-- ---- Times -----------------------------------------------------------------------------------
create or replace function public.preseason_propose_as(p_actor uuid, p_pairing_id uuid, p_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.preseason_pairings;
  s public.seasons;
  v_team uuid;
  v_match public.matches;
  v_conflict text;
  v_id uuid;
begin
  select * into pr from public.preseason_pairings where id = p_pairing_id for update;
  if not found then
    raise exception 'Preseason match not found' using errcode = 'P0002';
  end if;
  v_team := case
    when public.is_captain_of_for(p_actor, pr.home_team_id) then pr.home_team_id
    when public.is_captain_of_for(p_actor, pr.away_team_id) then pr.away_team_id
  end;
  if v_team is null then
    raise exception 'Only the captains of these two teams can propose a time' using errcode = '42501';
  end if;
  if pr.status = 'cancelled' then
    raise exception 'This preseason match was cancelled.' using errcode = 'P0001';
  end if;
  if pr.match_id is not null then
    select * into v_match from public.matches where id = pr.match_id;
    if v_match.status <> 'scheduled' then
      raise exception 'This match has started or finished, so its time can''t change.' using errcode = 'P0001';
    end if;
    if v_match.scheduled_at = p_at then
      raise exception 'That''s already the match time.' using errcode = 'P0001';
    end if;
  end if;
  if p_at < now() + interval '1 hour' then
    raise exception 'Pick a time at least 1 hour from now.' using errcode = 'P0001';
  end if;
  select * into s from public.seasons where id = pr.season_id;
  if s.starts_on is not null and p_at >= (s.starts_on::timestamp at time zone s.timezone) then
    raise exception 'Preseason matches have to be played before the regular season starts (%).',
      to_char(s.starts_on, 'Dy Mon FMDD') using errcode = 'P0001';
  end if;
  if exists (select 1 from public.preseason_proposals where pairing_id = p_pairing_id and status = 'pending') then
    raise exception 'A proposed time is already waiting for an answer. Answer or cancel it first.' using errcode = 'P0001';
  end if;
  v_conflict := public.preseason_conflict(pr.season_id, p_at, pr.match_id);
  if v_conflict is not null then
    raise exception '%', v_conflict using errcode = 'P0001';
  end if;

  insert into public.preseason_proposals (pairing_id, team_id, proposed_by, proposed_at)
  values (p_pairing_id, v_team, p_actor, p_at)
  returning id into v_id;
  perform public.enqueue_notification('preseason_proposal', jsonb_build_object('proposal_id', v_id));
  return v_id;
end;
$$;

create or replace function public.preseason_respond_as(p_actor uuid, p_proposal_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.preseason_proposals;
  pr public.preseason_pairings;
  v_other uuid;
  v_match public.matches;
  v_conflict text;
  v_id uuid;
begin
  select * into p from public.preseason_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'Proposal not found' using errcode = 'P0002';
  end if;
  select * into pr from public.preseason_pairings where id = p.pairing_id for update;
  v_other := case when p.team_id = pr.home_team_id then pr.away_team_id else pr.home_team_id end;
  if not public.is_captain_of_for(p_actor, v_other) then
    if public.is_captain_of_for(p_actor, p.team_id) then
      raise exception 'The other team''s captain has to answer. You can cancel your proposal instead.' using errcode = '42501';
    end if;
    raise exception 'Only the other team''s captain or co-captain can answer' using errcode = '42501';
  end if;
  if p.status <> 'pending' then
    raise exception 'This proposal was already answered or cancelled.' using errcode = 'P0001';
  end if;

  if p_accept then
    -- One accept at a time, so two pairs can't both take overlapping slots.
    perform pg_advisory_xact_lock(hashtext('bil.preseason_schedule'));
    if pr.status = 'cancelled' then
      raise exception 'This preseason match was cancelled.' using errcode = 'P0001';
    end if;
    if p.proposed_at < now() + interval '15 minutes' then
      raise exception 'That time has passed or is too close now. Decline it and propose a new one.' using errcode = 'P0001';
    end if;
    if pr.match_id is not null then
      select * into v_match from public.matches where id = pr.match_id;
      if v_match.status <> 'scheduled' then
        raise exception 'This match has started or finished, so its time can''t change.' using errcode = 'P0001';
      end if;
    end if;
    v_conflict := public.preseason_conflict(pr.season_id, p.proposed_at, pr.match_id);
    if v_conflict is not null then
      raise exception '% Decline this one and propose another.', v_conflict using errcode = 'P0001';
    end if;

    if pr.match_id is null then
      insert into public.matches (season_id, division_id, week, stage, home_team_id, away_team_id, default_at, scheduled_at)
      values (pr.season_id, null, 0, 'preseason', pr.home_team_id, pr.away_team_id, p.proposed_at, p.proposed_at)
      returning id into v_id;
      update public.preseason_pairings set match_id = v_id, status = 'scheduled' where id = pr.id;
    else
      update public.matches set scheduled_at = p.proposed_at, default_at = p.proposed_at where id = pr.match_id;
    end if;
  end if;

  update public.preseason_proposals
     set status = case when p_accept then 'accepted' else 'declined' end::public.reschedule_status,
         responded_by = p_actor, responded_at = now()
   where id = p_proposal_id;
  perform public.enqueue_notification('preseason_proposal', jsonb_build_object('proposal_id', p_proposal_id));
end;
$$;

create or replace function public.preseason_cancel_proposal_as(p_actor uuid, p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.preseason_proposals;
begin
  select * into p from public.preseason_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'Proposal not found' using errcode = 'P0002';
  end if;
  if not public.is_captain_of_for(p_actor, p.team_id) then
    raise exception 'Only the team that proposed the time can cancel it' using errcode = '42501';
  end if;
  if p.status <> 'pending' then
    raise exception 'This proposal was already answered or cancelled.' using errcode = 'P0001';
  end if;
  update public.preseason_proposals set status = 'cancelled', responded_by = p_actor, responded_at = now() where id = p_proposal_id;
  perform public.enqueue_notification('preseason_proposal', jsonb_build_object('proposal_id', p_proposal_id));
end;
$$;

create or replace function public.preseason_propose(p_pairing_id uuid, p_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return public.preseason_propose_as((select auth.uid()), p_pairing_id, p_at);
end;
$$;

create or replace function public.preseason_respond(p_proposal_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform public.preseason_respond_as((select auth.uid()), p_proposal_id, p_accept);
end;
$$;

create or replace function public.preseason_cancel_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform public.preseason_cancel_proposal_as((select auth.uid()), p_proposal_id);
end;
$$;

-- ---- Grants: *_as and helpers are for the bot (service role) only --------------------------
revoke all on function public.preseason_conflict(uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.teams_preseason_invite() from public, anon, authenticated;
revoke all on function public.preseason_set_interest_as(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.preseason_propose_as(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.preseason_respond_as(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.preseason_cancel_proposal_as(uuid, uuid) from public, anon, authenticated;
grant execute on function public.preseason_conflict(uuid, timestamptz, uuid) to service_role;
grant execute on function public.preseason_set_interest_as(uuid, uuid, boolean) to service_role;
grant execute on function public.preseason_propose_as(uuid, uuid, timestamptz) to service_role;
grant execute on function public.preseason_respond_as(uuid, uuid, boolean) to service_role;
grant execute on function public.preseason_cancel_proposal_as(uuid, uuid) to service_role;

revoke all on function public.preseason_send_invites(uuid) from public, anon;
revoke all on function public.preseason_generate(uuid, boolean) from public, anon;
revoke all on function public.preseason_cancel_pairing(uuid) from public, anon;
revoke all on function public.preseason_set_interest(uuid, boolean) from public, anon;
revoke all on function public.preseason_propose(uuid, timestamptz) from public, anon;
revoke all on function public.preseason_respond(uuid, boolean) from public, anon;
revoke all on function public.preseason_cancel_proposal(uuid) from public, anon;
grant execute on function public.preseason_send_invites(uuid) to authenticated;
grant execute on function public.preseason_generate(uuid, boolean) to authenticated;
grant execute on function public.preseason_cancel_pairing(uuid) to authenticated;
grant execute on function public.preseason_set_interest(uuid, boolean) to authenticated;
grant execute on function public.preseason_propose(uuid, timestamptz) to authenticated;
grant execute on function public.preseason_respond(uuid, boolean) to authenticated;
grant execute on function public.preseason_cancel_proposal(uuid) to authenticated;

-- ---- Keep preseason out of standings, stats and forfeits ------------------------------------
create or replace view public.team_maps_played_v with (security_invoker = true) as
 select m.season_id, s.team_id, count(mm.id)::integer as maps_played
   from public.matches m
   join public.match_maps mm on mm.match_id = m.id
   cross join lateral (values (m.home_team_id), (m.away_team_id)) s(team_id)
  where m.status = 'confirmed' and m.stage <> 'preseason'
  group by m.season_id, s.team_id;

create or replace view public.team_mode_records_v with (security_invoker = true) as
 select m.season_id, s.team_id, mm.mode_id, gm.name as mode_name,
        (count(*) filter (where w.winner = s.team_id))::integer as wins,
        (count(*) filter (where w.winner <> s.team_id))::integer as losses
   from public.matches m
   join public.match_maps mm on mm.match_id = m.id
   join public.game_modes gm on gm.id = mm.mode_id
   cross join lateral (values (m.home_team_id), (m.away_team_id)) s(team_id)
   cross join lateral (
     select coalesce(mm.winner_team_id,
              case when mm.home_score > mm.away_score then m.home_team_id
                   when mm.away_score > mm.home_score then m.away_team_id end) as winner
   ) w
  where m.status = 'confirmed' and m.stage <> 'preseason' and w.winner is not null
  group by m.season_id, s.team_id, mm.mode_id, gm.name;

create or replace view public.player_season_stats_v with (security_invoker = true) as
 with base as (
   select m.season_id, pms.user_id,
          count(*)::integer as maps_played,
          sum(pms.kills)::integer as kills,
          sum(pms.deaths)::integer as deaths,
          sum(pms.score)::integer as total_score,
          (array_agg(pms.team_id order by m.scheduled_at desc))[1] as team_id
     from public.player_map_stats pms
     join public.match_maps mm on mm.id = pms.match_map_id
     join public.matches m on m.id = mm.match_id
    where m.status = 'confirmed' and m.stage <> 'preseason'
    group by m.season_id, pms.user_id
 )
 select b.season_id, b.user_id, p.activision_id, p.avatar_url, b.team_id,
        t.name as team_name, t.tag as team_tag, b.maps_played, b.kills, b.deaths,
        round(b.kills::numeric / nullif(b.deaths, 0)::numeric, 2) as kd,
        b.kills - b.deaths as plus_minus,
        round(b.total_score::numeric / nullif(b.maps_played, 0)::numeric, 0)::integer as avg_score,
        coalesce(tm.maps_played, 0) as team_maps_played,
        (b.maps_played::numeric >= ceil(0.4 * coalesce(tm.maps_played, 0)::numeric) and b.maps_played > 0) as qualifies
   from base b
   join public.profiles p on p.id = b.user_id
   left join public.teams t on t.id = b.team_id
   left join public.team_maps_played_v tm on tm.season_id = b.season_id and tm.team_id = b.team_id;

do $$
declare
  v text;
  v_new text;
begin
  -- season_leaderboard / week_top_players: confirmed non-preseason matches only.
  v := pg_get_functiondef('public.season_leaderboard'::regproc);
  v_new := replace(v, 'where m.season_id = p_season_id and m.status = ''confirmed''',
                      'where m.season_id = p_season_id and m.status = ''confirmed'' and m.stage <> ''preseason''');
  if v_new = v then raise exception 'season_leaderboard patch did not apply'; end if;
  execute v_new;

  v := pg_get_functiondef('public.week_top_players'::regproc);
  v_new := replace(v, 'where m.status = ''confirmed'' and m.scheduled_at',
                      'where m.status = ''confirmed'' and m.stage <> ''preseason'' and m.scheduled_at');
  if v_new = v then raise exception 'week_top_players patch did not apply'; end if;
  execute v_new;

  -- Forfeits in preseason don't count toward the 2-forfeit removal rule (12.2).
  v := pg_get_functiondef('public.admin_forfeit'::regproc);
  v_new := replace(v, '  if m.forfeit_team_id is distinct from p_forfeit_team_id then',
                      '  if m.stage <> ''preseason'' and m.forfeit_team_id is distinct from p_forfeit_team_id then');
  if v_new = v then raise exception 'admin_forfeit patch did not apply'; end if;
  execute v_new;

  v := pg_get_functiondef('public.admin_clear_result'::regproc);
  v_new := replace(v, '  if m.forfeit_team_id is not null then',
                      '  if m.forfeit_team_id is not null and m.stage <> ''preseason'' then');
  if v_new = v then raise exception 'admin_clear_result patch did not apply'; end if;
  execute v_new;

  -- Preseason times move through preseason proposals, not reschedule requests.
  v := pg_get_functiondef('public.reschedule_requests_guard'::regproc);
  v_new := replace(v, E'  if tg_op = ''INSERT'' then\n',
                      E'  if tg_op = ''INSERT'' then\n    if v_match.stage = ''preseason'' then\n      raise exception ''Preseason times are changed by proposing a new time in the preseason channel or on My team.'' using errcode = ''P0001'';\n    end if;\n');
  if v_new = v then raise exception 'reschedule_requests_guard patch did not apply'; end if;
  execute v_new;
end $$;
