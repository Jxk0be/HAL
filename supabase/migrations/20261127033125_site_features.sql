-- Site features: replay links, multi-role recruiting posts, profile customization, the player stats
-- breakdown and match-day Discord channels.

-- ---------------------------------------------------------------------------
-- 1. Replays (VODs): a link the match's caster (or an admin) adds after the cast.
-- ---------------------------------------------------------------------------
alter table public.matches add column vod_url text
  check (vod_url is null or public.is_stream_url(vod_url));

create function public.set_vod(p_match_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if not (public.is_caster() or public.is_admin()) then
    raise exception 'Only casters and admins can add a replay' using errcode = '42501';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if public.is_party_to_match(p_match_id) then
    raise exception 'You cannot take staff actions on your own team''s match' using errcode = '42501';
  end if;
  if m.broadcast_by is not null and m.broadcast_by <> (select auth.uid()) and not public.is_admin() then
    raise exception 'Another caster cast this match' using errcode = 'P0001';
  end if;
  if v_url is not null and not public.is_stream_url(v_url) then
    raise exception 'Use an https:// link to Twitch, YouTube or Kick' using errcode = 'P0001';
  end if;
  update public.matches
     set vod_url = v_url,
         broadcast_by = coalesce(broadcast_by, (select auth.uid()))
   where id = p_match_id;
  -- Audited by the audit_staff_change trigger on matches, like set_broadcast.
end;
$$;
revoke execute on function public.set_vod(uuid, text) from public, anon;
grant execute on function public.set_vod(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Recruiting posts: several roles per post (empty = any role).
-- ---------------------------------------------------------------------------
alter table public.team_recruit_posts add column roles text[] not null default '{}'
  check (roles <@ array['AR', 'SMG', 'Flex']::text[]);
update public.team_recruit_posts set roles = array[preferred_role] where preferred_role is not null;
drop function public.recruit_board();
drop function public.recruit_save(uuid, text, text, text, text);
alter table public.team_recruit_posts drop column preferred_role;

create function public.recruit_save(
  p_team_id uuid,
  p_looking_for text,
  p_roles text[],
  p_availability text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_team public.teams;
  v_reason text;
  v_roles text[];
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.is_captain_of_for(v_uid, p_team_id) then
    raise exception 'Only the captain or co-captain can post for the team' using errcode = '42501';
  end if;
  if p_looking_for not in ('starter', 'sub', 'any') then
    raise exception 'Pick starter, sub or either' using errcode = 'P0001';
  end if;
  -- Keep AR, SMG, Flex order; ticking all three is the same as any role.
  select coalesce(array_agg(r order by array_position(array['AR', 'SMG', 'Flex'], r)), '{}')
    into v_roles from (select distinct unnest(coalesce(p_roles, '{}')) as r) x;
  if not v_roles <@ array['AR', 'SMG', 'Flex']::text[] then
    raise exception 'Roles must be AR, SMG or Flex' using errcode = 'P0001';
  end if;
  if cardinality(v_roles) = 3 then
    v_roles := '{}';
  end if;
  v_reason := public.recruit_block_reason(p_team_id, p_looking_for);
  if v_reason is not null then
    raise exception '%', v_reason using errcode = 'P0001';
  end if;
  select * into v_team from public.teams where id = p_team_id;

  update public.team_recruit_posts
     set looking_for = p_looking_for, roles = v_roles,
         availability = left(nullif(btrim(p_availability), ''), 280),
         note = left(nullif(btrim(p_note), ''), 1000),
         updated_at = now()
   where team_id = p_team_id and active
  returning id into v_id;
  if v_id is null then
    insert into public.team_recruit_posts (team_id, season_id, created_by, looking_for, roles, availability, note)
    values (p_team_id, v_team.season_id, v_uid, p_looking_for, v_roles,
            left(nullif(btrim(p_availability), ''), 280), left(nullif(btrim(p_note), ''), 1000))
    returning id into v_id;
  end if;
  perform public.enqueue_notification('recruit_changed', jsonb_build_object('post_id', v_id));
  return v_id;
end;
$$;
revoke execute on function public.recruit_save(uuid, text, text[], text, text) from public, anon;
grant execute on function public.recruit_save(uuid, text, text[], text, text) to authenticated;

create function public.recruit_board()
returns table (
  post_id uuid,
  team_id uuid,
  team_name text,
  team_tag text,
  logo_url text,
  team_status public.team_status,
  looking_for text,
  roles text[],
  availability text,
  note text,
  updated_at timestamptz,
  open int,
  starters_open int,
  subs_open int
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, t.id, t.name, t.tag, t.logo_url, t.status,
         p.looking_for, p.roles, p.availability, p.note, p.updated_at,
         sp.open, sp.starters_open, sp.subs_open
    from public.team_recruit_posts p
    join public.teams t on t.id = p.team_id
    join public.seasons s on s.id = p.season_id
    cross join lateral public.team_open_spots(t.id) sp
   where p.active
     and t.status <> 'removed'
     and s.status in ('signups', 'regular', 'playoffs')
     and (s.roster_lock_at is null or now() < s.roster_lock_at)
   order by p.updated_at desc;
$$;
revoke execute on function public.recruit_board() from public;
grant execute on function public.recruit_board() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Profile customization (public; each player edits their own row).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column bio text check (char_length(bio) <= 300),
  add column main_role text check (main_role in ('AR', 'SMG', 'Flex')),
  add column favorite_weapon text check (char_length(favorite_weapon) <= 40),
  add column profile_color text check (profile_color in ('red', 'blue', 'green', 'gold', 'purple', 'teal')),
  add column twitch_handle text check (twitch_handle ~ '^[A-Za-z0-9_]{3,25}$'),
  add column youtube_handle text check (youtube_handle ~ '^[A-Za-z0-9._-]{3,30}$'),
  add column x_handle text check (x_handle ~ '^[A-Za-z0-9_]{1,15}$'),
  add column tiktok_handle text check (tiktok_handle ~ '^[A-Za-z0-9._]{2,24}$');
grant select (bio, main_role, favorite_weapon, profile_color, twitch_handle, youtube_handle, x_handle, tiktok_handle)
  on public.profiles to anon, authenticated;
grant update (bio, main_role, favorite_weapon, profile_color, twitch_handle, youtube_handle, x_handle, tiktok_handle)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Player stats breakdown (confirmed league matches; preseason excluded). RLS applies.
-- ---------------------------------------------------------------------------
create function public.player_breakdown(p_user_id uuid, p_season_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with lines as (
    select s.kills, s.deaths, s.score, s.team_id, mm.id as map_row, mm.winner_team_id as map_winner,
           g.name as mode_name, mp.name as map_name,
           m.id as match_id, m.week, m.season_id, m.scheduled_at, m.winner_team_id as match_winner,
           case when m.home_team_id = s.team_id then m.away_team_id else m.home_team_id end as opponent_id
      from public.player_map_stats s
      join public.match_maps mm on mm.id = s.match_map_id
      join public.matches m on m.id = mm.match_id
      join public.game_modes g on g.id = mm.mode_id
      join public.maps mp on mp.id = mm.map_id
     where s.user_id = p_user_id
       and m.status = 'confirmed'
       and m.stage <> 'preseason'
       and (p_season_id is null or m.season_id = p_season_id)
  ),
  per_match as (
    select match_id, max(scheduled_at) as scheduled_at, max(opponent_id::text)::uuid as opponent_id,
           bool_or(match_winner = team_id) as won, bool_or(match_winner is not null) as decided,
           sum(kills)::int as kills, sum(deaths)::int as deaths, sum(score)::int as score, count(*)::int as maps
      from lines group by match_id
  ),
  -- Top score in the whole match (both teams) = match MVP.
  match_tops as (
    select mm.match_id, s.user_id, sum(s.score) as total,
           rank() over (partition by mm.match_id order by sum(s.score) desc) as rk
      from public.player_map_stats s
      join public.match_maps mm on mm.id = s.match_map_id
     where mm.match_id in (select match_id from per_match)
     group by mm.match_id, s.user_id
  )
  select jsonb_build_object(
    'career', (
      select jsonb_build_object(
        'maps', count(*),
        'kills', coalesce(sum(kills), 0),
        'deaths', coalesce(sum(deaths), 0),
        'avg_score', coalesce(round(avg(score)), 0),
        'map_wins', count(*) filter (where map_winner = team_id),
        'matches', (select count(*) from per_match),
        'wins', (select count(*) from per_match where won),
        'losses', (select count(*) from per_match where decided and not won),
        'mvps', (select count(*) from match_tops where user_id = p_user_id and rk = 1),
        'seasons', count(distinct season_id)
      ) from lines
    ),
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object('week', week, 'maps', maps, 'kills', kills, 'deaths', deaths, 'avg_score', avg_score) order by week)
        from (select week, count(*) as maps, sum(kills) as kills, sum(deaths) as deaths, round(avg(score)) as avg_score
                from lines where p_season_id is null or season_id = p_season_id group by week) w
    ), '[]'::jsonb),
    'modes', coalesce((
      select jsonb_agg(jsonb_build_object('name', mode_name, 'maps', maps, 'kills', kills, 'deaths', deaths, 'avg_score', avg_score, 'wins', wins) order by maps desc, mode_name)
        from (select mode_name, count(*) as maps, sum(kills) as kills, sum(deaths) as deaths, round(avg(score)) as avg_score,
                     count(*) filter (where map_winner = team_id) as wins
                from lines group by mode_name) x
    ), '[]'::jsonb),
    'maps', coalesce((
      select jsonb_agg(jsonb_build_object('name', map_name, 'maps', maps, 'kills', kills, 'deaths', deaths, 'avg_score', avg_score, 'wins', wins) order by maps desc, map_name)
        from (select map_name, count(*) as maps, sum(kills) as kills, sum(deaths) as deaths, round(avg(score)) as avg_score,
                     count(*) filter (where map_winner = team_id) as wins
                from lines group by map_name) x
    ), '[]'::jsonb),
    'best_match', (
      select jsonb_build_object('match_id', pm.match_id, 'kills', pm.kills, 'deaths', pm.deaths, 'score', pm.score,
                                'maps', pm.maps, 'won', pm.won, 'scheduled_at', pm.scheduled_at, 'opponent', t.name)
        from per_match pm left join public.teams t on t.id = pm.opponent_id
       order by pm.kills desc, pm.score desc limit 1
    )
  );
$$;
revoke execute on function public.player_breakdown(uuid, uuid) from public;
grant execute on function public.player_breakdown(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Match-day channels (the scheduler creates them 15 minutes before; teams lose access once the
--    match is confirmed, the channel stays for audit).
-- ---------------------------------------------------------------------------
alter table public.matches
  add column discord_match_channel_id text,
  add column discord_match_channel_closed_at timestamptz;
