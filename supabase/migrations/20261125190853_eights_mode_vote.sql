-- 8s mode vote. A full queue now starts the match in 'voting': the 8 players have 2 minutes to vote
-- for a mode (any active mode with at least one active map). Voting closes early once all 8 have
-- voted. The most-voted mode wins (ties and no votes: random among them), then a random active map
-- from that mode's pool is picked. Only then is the match 'live' and reportable.
-- pg_cron runs eights_tick() every 15 seconds to close votes whose time is up and tell the bot.

alter table public.eights_matches drop constraint eights_matches_status_check;
alter table public.eights_matches
  add constraint eights_matches_status_check check (status in ('voting', 'live', 'confirmed', 'disputed', 'cancelled')),
  add column vote_ends_at timestamptz,
  add column mode_id uuid references public.game_modes (id) on delete set null,
  add column map_id uuid references public.maps (id) on delete set null;
alter table public.eights_matches alter column status set default 'voting';

create table public.eights_votes (
  match_id uuid not null,
  user_id uuid not null,
  mode_id uuid not null references public.game_modes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id),
  foreign key (match_id, user_id) references public.eights_players (match_id, user_id) on delete cascade
);
create index eights_votes_mode_idx on public.eights_votes (mode_id);
alter table public.eights_votes enable row level security;
revoke all on public.eights_votes from anon, authenticated;

-- Modes 8s can vote on: active, with at least one active map in their pool.
create function public.eights_vote_modes()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select gm.id, gm.name
    from public.game_modes gm
   where gm.active
     and exists (
       select 1 from public.map_modes mm join public.maps mp on mp.id = mm.map_id and mp.active
        where mm.mode_id = gm.id
     )
   order by gm.sort_order, gm.name;
$$;

-- Settles a vote: winning mode (ties / no votes: random), random map for it, status 'live'.
-- Returns false if the match isn't voting any more (already closed).
create function public.eights_close_vote(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode uuid;
  v_map uuid;
begin
  perform 1 from public.eights_matches where id = p_match_id and status = 'voting' for update;
  if not found then
    return false;
  end if;

  with eligible as (select id from public.eights_vote_modes()),
  tally as (
    select e.id, count(v.user_id) as n
      from eligible e
      left join public.eights_votes v on v.match_id = p_match_id and v.mode_id = e.id
     group by e.id
  )
  select id into v_mode from tally where n = (select max(n) from tally) order by random() limit 1;

  if v_mode is not null then
    select mp.id into v_map
      from public.map_modes mm join public.maps mp on mp.id = mm.map_id and mp.active
     where mm.mode_id = v_mode
     order by random() limit 1;
  end if;

  update public.eights_matches m
     set status = 'live',
         mode_id = v_mode,
         map_id = v_map,
         mode_name = (select name from public.game_modes where id = v_mode),
         map_name = (select name from public.maps where id = v_map)
   where m.id = p_match_id;
  return true;
end;
$$;

-- A player in the match votes (or changes their vote) while voting is open.
-- Returns { status: 'voted' | 'closed' } ('closed' when this was the 8th vote).
create function public.eights_vote(p_user_id uuid, p_match_id uuid, p_mode_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_ends timestamptz;
begin
  select status, vote_ends_at into v_status, v_ends from public.eights_matches where id = p_match_id for update;
  if v_status is null then
    raise exception 'That 8s match doesn''t exist.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.eights_players where match_id = p_match_id and user_id = p_user_id) then
    raise exception 'Only the 8 players in this match can vote.' using errcode = 'P0001';
  end if;
  if v_status <> 'voting' or v_ends <= now() then
    raise exception 'Voting for this match is over.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.eights_vote_modes() where id = p_mode_id) then
    raise exception 'That mode isn''t in the 8s pool any more.' using errcode = 'P0001';
  end if;

  insert into public.eights_votes (match_id, user_id, mode_id) values (p_match_id, p_user_id, p_mode_id)
  on conflict (match_id, user_id) do update set mode_id = excluded.mode_id, created_at = now();

  if (select count(*) from public.eights_votes where match_id = p_match_id) >= 8 then
    perform public.eights_close_vote(p_match_id);
    return jsonb_build_object('status', 'closed');
  end if;
  return jsonb_build_object('status', 'voted');
end;
$$;

-- pg_cron, every 15 seconds: close votes whose 2 minutes are up and ask the bot to redraw them.
create function public.eights_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := '{}';
  v_id uuid;
  v_url text;
  v_secret text;
begin
  for v_id in select id from public.eights_matches where status = 'voting' and vote_ends_at <= now() loop
    if public.eights_close_vote(v_id) then
      v_ids := v_ids || v_id;
    end if;
  end loop;
  if cardinality(v_ids) = 0 then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'discord_sync_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'discord_sync_secret' limit 1;
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('action', 'eights_votes_closed', 'match_ids', to_jsonb(v_ids)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hal-sync-secret', v_secret),
    timeout_milliseconds := 10000
  );
end;
$$;

-- Starting a match now opens the vote instead of picking a map straight away, and players in a
-- voting match can't queue again either.
create or replace function public.eights_join(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_match uuid;
begin
  -- One queue: serialise joins so two people can't both start a match with the same players.
  perform pg_advisory_xact_lock(hashtext('eights_queue'));

  -- 8s is casual: any account with an Activision ID can play, staff-only included.
  if exists (
    select 1 from public.profiles p
     where p.id = p_user_id and p.banned_until is not null and p.banned_until > now()
  ) then
    raise exception 'You''re banned, so you can''t join 8s right now.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = p_user_id and p.activision_id is not null
  ) then
    raise exception 'Add your Activision ID on the site first (My profile).' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.eights_players ep join public.eights_matches m on m.id = ep.match_id
     where ep.user_id = p_user_id and m.status in ('voting', 'live')
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

  insert into public.eights_matches (status, vote_ends_at)
  values ('voting', now() + interval '2 minutes')
  returning id into v_match;

  with picked as (
    select user_id from public.eights_queue order by joined_at, user_id limit 8
  ), shuffled as (
    select user_id, row_number() over (order by random()) as n from picked
  )
  insert into public.eights_players (match_id, user_id, team)
  select v_match, user_id, case when n <= 4 then 'a' else 'b' end from shuffled;

  delete from public.eights_queue q using public.eights_players ep
   where ep.match_id = v_match and ep.user_id = q.user_id;

  -- No mode has a map yet: skip the vote and let the players pick.
  if not exists (select 1 from public.eights_vote_modes()) then
    perform public.eights_close_vote(v_match);
  end if;

  return jsonb_build_object('status', 'started', 'count', (select count(*) from public.eights_queue), 'match_id', v_match);
end;
$$;

-- Reporting while the mode vote is still open gets a clear message.
create or replace function public.eights_report(p_user_id uuid, p_match_id uuid, p_winner text)
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
  if v_status = 'voting' then
    raise exception 'Voting for the mode is still open. Report once you''ve played.' using errcode = 'P0001';
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

revoke execute on function public.eights_vote_modes() from public, anon, authenticated;
revoke execute on function public.eights_close_vote(uuid) from public, anon, authenticated;
revoke execute on function public.eights_vote(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.eights_tick() from public, anon, authenticated;
revoke execute on function public.eights_join(uuid) from public, anon, authenticated;
revoke execute on function public.eights_report(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.eights_vote_modes() to service_role;
grant execute on function public.eights_vote(uuid, uuid, uuid) to service_role;
grant execute on function public.eights_join(uuid) to service_role;
grant execute on function public.eights_report(uuid, uuid, text) to service_role;

select cron.schedule('bil-eights-tick', '15 seconds', 'select public.eights_tick()');
