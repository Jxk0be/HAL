-- 8s: casual 4v4 pick-up matches run by the bot in #lf-8s.
-- Players with a linked, finished profile queue with a button; at 8 the bot shuffles them into
-- Team A / Team B, picks a random map and mode, and moves them into the team voice channels.
-- Both teams report the winner: 2 matching reports from each team confirm it, any disagreement
-- flags the match for BIL Admin. The leaderboard ranks confirmed results by wins, then win %.
-- Only the bot (service role) touches these tables.

create table public.eights_queue (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now()
);

create table public.eights_matches (
  id uuid primary key default gen_random_uuid(),
  number integer generated always as identity unique,
  status text not null default 'live' check (status in ('live', 'confirmed', 'disputed', 'cancelled')),
  winner text check (winner in ('a', 'b')),
  map_name text,
  mode_name text,
  channel_id text,
  message_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  constraint eights_matches_winner_when_confirmed check ((status = 'confirmed') = (winner is not null))
);
create index eights_matches_status_idx on public.eights_matches (status);

create table public.eights_players (
  match_id uuid not null references public.eights_matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team text not null check (team in ('a', 'b')),
  primary key (match_id, user_id)
);
create index eights_players_user_idx on public.eights_players (user_id);

create table public.eights_reports (
  match_id uuid not null,
  user_id uuid not null,
  winner text not null check (winner in ('a', 'b')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id),
  foreign key (match_id, user_id) references public.eights_players (match_id, user_id) on delete cascade
);

alter table public.eights_queue enable row level security;
alter table public.eights_matches enable row level security;
alter table public.eights_players enable row level security;
alter table public.eights_reports enable row level security;
revoke all on public.eights_queue, public.eights_matches, public.eights_players, public.eights_reports from anon, authenticated;

-- Joins the queue. At 8 players it starts a match with the 8 who have waited longest.
-- Returns { status: 'queued' | 'already' | 'started', count, match_id? }.
create function public.eights_join(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_match uuid;
  v_map text;
  v_mode text;
begin
  -- One queue: serialise joins so two people can't both start a match with the same players.
  perform pg_advisory_xact_lock(hashtext('eights_queue'));

  if not exists (
    select 1 from public.profiles p
     where p.id = p_user_id and p.is_player and (p.banned_until is null or p.banned_until <= now())
  ) then
    raise exception 'Only players can join 8s (not staff-only or banned accounts).' using errcode = 'P0001';
  end if;
  if not public.is_profile_complete(p_user_id) then
    raise exception 'Finish your profile on the site first (Activision ID, platform and age).' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.eights_players ep join public.eights_matches m on m.id = ep.match_id
     where ep.user_id = p_user_id and m.status = 'live'
  ) then
    raise exception 'You''re in an 8s match that hasn''t been reported yet. Report it first.' using errcode = 'P0001';
  end if;

  -- People who queued and walked away drop off after 2 hours.
  delete from public.eights_queue where joined_at < now() - interval '2 hours';

  insert into public.eights_queue (user_id) values (p_user_id) on conflict (user_id) do nothing;
  if not found then
    return jsonb_build_object('status', 'already', 'count', (select count(*) from public.eights_queue));
  end if;

  select count(*) into v_count from public.eights_queue;
  if v_count < 8 then
    return jsonb_build_object('status', 'queued', 'count', v_count);
  end if;

  select mp.name, gm.name into v_map, v_mode
    from public.map_modes mm
    join public.maps mp on mp.id = mm.map_id and mp.active
    join public.game_modes gm on gm.id = mm.mode_id and gm.active
   order by random()
   limit 1;

  insert into public.eights_matches (map_name, mode_name) values (v_map, v_mode) returning id into v_match;

  with picked as (
    select user_id from public.eights_queue order by joined_at, user_id limit 8
  ), shuffled as (
    select user_id, row_number() over (order by random()) as n from picked
  )
  insert into public.eights_players (match_id, user_id, team)
  select v_match, user_id, case when n <= 4 then 'a' else 'b' end from shuffled;

  delete from public.eights_queue q using public.eights_players ep
   where ep.match_id = v_match and ep.user_id = q.user_id;

  return jsonb_build_object('status', 'started', 'count', (select count(*) from public.eights_queue), 'match_id', v_match);
end;
$$;

create function public.eights_leave(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with d as (delete from public.eights_queue where user_id = p_user_id returning 1)
  select exists (select 1 from d);
$$;

-- A player reports the winner. 2 reports from each team that all agree confirm the match; any
-- disagreement flags it for an admin (once). Changing your own report is allowed while it's live.
-- Returns { status: 'saved' | 'confirmed' | 'disputed', winner?, a_reports, b_reports }.
create function public.eights_report(p_user_id uuid, p_match_id uuid, p_winner text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_a integer;
  v_b integer;
  v_winners integer;
  v_winner text;
begin
  if p_winner not in ('a', 'b') then
    raise exception 'Pick Team A or Team B.' using errcode = 'P0001';
  end if;
  select status into v_status from public.eights_matches where id = p_match_id for update;
  if v_status is null then
    raise exception 'That 8s match doesn''t exist.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.eights_players where match_id = p_match_id and user_id = p_user_id) then
    raise exception 'Only the 8 players in this match can report it.' using errcode = 'P0001';
  end if;
  if v_status = 'disputed' then
    raise exception 'The reports didn''t match, so an admin is deciding this one.' using errcode = 'P0001';
  end if;
  if v_status <> 'live' then
    raise exception 'This match is already settled.' using errcode = 'P0001';
  end if;

  insert into public.eights_reports (match_id, user_id, winner) values (p_match_id, p_user_id, p_winner)
  on conflict (match_id, user_id) do update set winner = excluded.winner, updated_at = now();

  select count(*) filter (where ep.team = 'a'), count(*) filter (where ep.team = 'b'),
         count(distinct r.winner), min(r.winner)
    into v_a, v_b, v_winners, v_winner
    from public.eights_reports r
    join public.eights_players ep on ep.match_id = r.match_id and ep.user_id = r.user_id
   where r.match_id = p_match_id;

  if v_winners > 1 then
    update public.eights_matches set status = 'disputed' where id = p_match_id;
    return jsonb_build_object('status', 'disputed', 'a_reports', v_a, 'b_reports', v_b);
  end if;
  if v_a >= 2 and v_b >= 2 then
    update public.eights_matches set status = 'confirmed', winner = v_winner, resolved_at = now() where id = p_match_id;
    return jsonb_build_object('status', 'confirmed', 'winner', v_winner, 'a_reports', v_a, 'b_reports', v_b);
  end if;
  return jsonb_build_object('status', 'saved', 'a_reports', v_a, 'b_reports', v_b);
end;
$$;

-- An admin settles a match: p_winner 'a' / 'b', or null to cancel it (no result counts).
-- Works on any status, so an admin can also correct a confirmed result. Logged in the audit log.
create function public.eights_resolve(p_actor uuid, p_match_id uuid, p_winner text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
begin
  if not public.is_admin_for(p_actor) then
    raise exception 'Only admins can settle 8s matches.' using errcode = 'P0001';
  end if;
  if p_winner is not null and p_winner not in ('a', 'b') then
    raise exception 'Pick Team A or Team B.' using errcode = 'P0001';
  end if;
  update public.eights_matches
     set status = case when p_winner is null then 'cancelled' else 'confirmed' end,
         winner = p_winner, resolved_at = now(), resolved_by = p_actor
   where id = p_match_id
  returning number into v_number;
  if v_number is null then
    raise exception 'That 8s match doesn''t exist.' using errcode = 'P0001';
  end if;
  insert into public.audit_log (actor_id, actor_role, action, table_name, row_id, new_data)
  values (p_actor, 'admin', case when p_winner is null then 'cancelled' else 'settled' end,
          'eights_matches', p_match_id::text,
          jsonb_build_object('match', v_number, 'winner', case p_winner when 'a' then 'Team A' when 'b' then 'Team B' end));
end;
$$;

-- Confirmed 8s results: most wins first, then win %, then games played.
create function public.eights_leaderboard(p_limit integer default 15)
returns table (user_id uuid, name text, discord_id text, wins bigint, losses bigint, played bigint, win_pct numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(p.activision_id, p.discord_username, 'Player'), p.discord_id,
         count(*) filter (where ep.team = m.winner),
         count(*) filter (where ep.team <> m.winner),
         count(*),
         round(100.0 * count(*) filter (where ep.team = m.winner) / count(*), 1)
    from public.eights_players ep
    join public.eights_matches m on m.id = ep.match_id and m.status = 'confirmed'
    join public.profiles p on p.id = ep.user_id
   group by p.id
   order by 4 desc, 7 desc, 6 desc, 2
   limit least(greatest(coalesce(p_limit, 15), 1), 50);
$$;

revoke execute on function public.eights_join(uuid) from public, anon, authenticated;
revoke execute on function public.eights_leave(uuid) from public, anon, authenticated;
revoke execute on function public.eights_report(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.eights_resolve(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.eights_leaderboard(integer) from public, anon, authenticated;
grant execute on function public.eights_join(uuid) to service_role;
grant execute on function public.eights_leave(uuid) to service_role;
grant execute on function public.eights_report(uuid, uuid, text) to service_role;
grant execute on function public.eights_resolve(uuid, uuid, text) to service_role;
grant execute on function public.eights_leaderboard(integer) to service_role;

-- Rebrand leftover: the audit feed called bot actions "HAL bot".
create or replace function public.audit_summary(p_actor_role text, p_actor_name text, p_action text, p_table text, p_row_id text, p_old jsonb, p_new jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws(' ',
           case when p_actor_role = 'system' then 'Blackhat bot'
                else initcap(coalesce(p_actor_role, 'staff')) || ' ' || coalesce(p_actor_name, 'unknown') end,
           case p_action when 'insert' then 'added' when 'update' then 'changed' when 'delete' then 'removed'
                else p_action end,
           public.audit_row_label(p_table, p_row_id, coalesce(p_new, p_old)))
         || case when p_action = 'update' then
              ': ' || (
                select string_agg(
                         format('%s %s → %s', replace(k, '_', ' '),
                                coalesce(p_old ->> k, '—'), coalesce(p_new ->> k, '—')),
                         ', ' order by k)
                  from jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) k
              )
            else '' end;
$$;
