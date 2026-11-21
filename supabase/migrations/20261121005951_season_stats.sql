-- Public season stats, computed in Postgres (step 13).
-- Only confirmed and forfeit matches count. A forfeit is a 3-0 series loss for the forfeiting team.
-- All views are security_invoker over public tables; nothing here exposes Discord names.

-- ---------------------------------------------------------------------------
-- One row per team per counted match.
-- ---------------------------------------------------------------------------
create view public.match_results_v
with (security_invoker = true) as
  select m.id as match_id,
         m.season_id,
         m.division_id,
         m.stage,
         m.playoff_round,
         m.week,
         m.scheduled_at,
         m.status,
         s.team_id,
         s.opponent_id,
         s.is_home,
         case when m.status = 'forfeit' then m.forfeit_team_id <> s.team_id
              else m.winner_team_id = s.team_id end as won,
         case when m.status = 'forfeit' then (case when m.forfeit_team_id = s.team_id then 0 else 3 end)
              when s.is_home then coalesce(m.home_series, 0) else coalesce(m.away_series, 0) end as maps_won,
         case when m.status = 'forfeit' then (case when m.forfeit_team_id = s.team_id then 3 else 0 end)
              when s.is_home then coalesce(m.away_series, 0) else coalesce(m.home_series, 0) end as maps_lost,
         -- Round differential on the deciding (last) map of the series.
         coalesce((
           select case when s.is_home then mm.home_score - mm.away_score else mm.away_score - mm.home_score end
             from public.match_maps mm
            where mm.match_id = m.id and mm.home_score is not null and mm.away_score is not null
            order by mm.map_number desc
            limit 1
         ), 0) as deciding_diff
    from public.matches m
    cross join lateral (values (m.home_team_id, m.away_team_id, true), (m.away_team_id, m.home_team_id, false))
      as s(team_id, opponent_id, is_home)
   where (m.status = 'confirmed' and m.winner_team_id is not null)
      or (m.status = 'forfeit' and m.forfeit_team_id is not null);

-- ---------------------------------------------------------------------------
-- Standings for a division (or the whole league when there are no divisions), sorted with the
-- rulebook tiebreaks: series wins, map differential, head-to-head among the tied teams,
-- deciding-map round differential, then flagged for an admin decision (name order as a placeholder).
-- ---------------------------------------------------------------------------
create function public.division_standings(p_season_id uuid, p_division_id uuid default null)
returns table (
  rank int,
  team_id uuid,
  name text,
  tag text,
  logo_url text,
  played int,
  wins int,
  losses int,
  maps_won int,
  maps_lost int,
  map_diff int,
  h2h_wins int,
  deciding_diff int,
  last5 text[],
  needs_admin_decision boolean
)
language sql
stable
set search_path = ''
as $$
  with t as (
    select id, name, tag, logo_url
      from public.teams
     where season_id = p_season_id and status = 'approved'
       and division_id is not distinct from p_division_id
  ),
  r as (
    select * from public.match_results_v
     where season_id = p_season_id and stage = 'regular' and team_id in (select id from t)
  ),
  agg as (
    select t.id, t.name, t.tag, t.logo_url,
           count(r.match_id)::int as played,
           (count(r.match_id) filter (where r.won))::int as wins,
           (count(r.match_id) filter (where not r.won))::int as losses,
           coalesce(sum(r.maps_won), 0)::int as maps_won,
           coalesce(sum(r.maps_lost), 0)::int as maps_lost,
           coalesce(sum(r.deciding_diff), 0)::int as deciding_diff
      from t left join r on r.team_id = t.id
     group by t.id, t.name, t.tag, t.logo_url
  ),
  agg2 as (
    select a.*, a.maps_won - a.maps_lost as map_diff from agg a
  ),
  h2h as (
    select a.id,
           (select count(*) from r
             where r.team_id = a.id and r.won
               and r.opponent_id in (
                 select b.id from agg2 b where b.id <> a.id and b.wins = a.wins and b.map_diff = a.map_diff))::int as h2h_wins
      from agg2 a
  ),
  last5 as (
    select x.team_id, array_agg(case when x.won then 'W' else 'L' end order by x.scheduled_at desc) as last5
      from (select r.*, row_number() over (partition by r.team_id order by r.scheduled_at desc) as rn from r) x
     where x.rn <= 5
     group by x.team_id
  ),
  fin as (
    select a.*, h.h2h_wins, coalesce(l.last5, '{}') as last5
      from agg2 a join h2h h on h.id = a.id left join last5 l on l.team_id = a.id
  )
  select (row_number() over (order by f.wins desc, f.map_diff desc, f.h2h_wins desc, f.deciding_diff desc, f.name))::int,
         f.id, f.name, f.tag, f.logo_url, f.played, f.wins, f.losses, f.maps_won, f.maps_lost, f.map_diff,
         f.h2h_wins, f.deciding_diff, f.last5,
         f.played > 0 and exists (
           select 1 from fin g
            where g.id <> f.id and g.wins = f.wins and g.map_diff = f.map_diff
              and g.h2h_wins = f.h2h_wins and g.deciding_diff = f.deciding_diff
         )
    from fin f
   order by 1;
$$;
grant execute on function public.division_standings(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Maps each team has played in confirmed matches (for the leaderboard qualifier).
-- ---------------------------------------------------------------------------
create view public.team_maps_played_v
with (security_invoker = true) as
  select m.season_id, s.team_id, count(mm.id)::int as maps_played
    from public.matches m
    join public.match_maps mm on mm.match_id = m.id
    cross join lateral (values (m.home_team_id), (m.away_team_id)) as s(team_id)
   where m.status = 'confirmed'
   group by m.season_id, s.team_id;

-- ---------------------------------------------------------------------------
-- Player season stats from confirmed values only.
-- qualifies = played at least 40% of their team's maps (leaderboard minimum).
-- ---------------------------------------------------------------------------
create view public.player_season_stats_v
with (security_invoker = true) as
  with base as (
    select m.season_id,
           pms.user_id,
           count(*)::int as maps_played,
           sum(pms.kills)::int as kills,
           sum(pms.deaths)::int as deaths,
           sum(pms.score)::int as total_score,
           (array_agg(pms.team_id order by m.scheduled_at desc))[1] as team_id
      from public.player_map_stats pms
      join public.match_maps mm on mm.id = pms.match_map_id
      join public.matches m on m.id = mm.match_id
     where m.status = 'confirmed'
     group by m.season_id, pms.user_id
  )
  select b.season_id,
         b.user_id,
         p.activision_id,
         p.avatar_url,
         b.team_id,
         t.name as team_name,
         t.tag as team_tag,
         b.maps_played,
         b.kills,
         b.deaths,
         round(b.kills::numeric / nullif(b.deaths, 0), 2) as kd,
         b.kills - b.deaths as plus_minus,
         round(b.total_score::numeric / nullif(b.maps_played, 0), 0)::int as avg_score,
         coalesce(tm.maps_played, 0) as team_maps_played,
         b.maps_played >= ceil(0.4 * coalesce(tm.maps_played, 0)) and b.maps_played > 0 as qualifies
    from base b
    join public.profiles p on p.id = b.user_id
    left join public.teams t on t.id = b.team_id
    left join public.team_maps_played_v tm on tm.season_id = b.season_id and tm.team_id = b.team_id;

-- ---------------------------------------------------------------------------
-- Team map record per mode.
-- ---------------------------------------------------------------------------
create view public.team_mode_records_v
with (security_invoker = true) as
  select m.season_id,
         s.team_id,
         mm.mode_id,
         gm.name as mode_name,
         (count(*) filter (where w.winner = s.team_id))::int as wins,
         (count(*) filter (where w.winner <> s.team_id))::int as losses
    from public.matches m
    join public.match_maps mm on mm.match_id = m.id
    join public.game_modes gm on gm.id = mm.mode_id
    cross join lateral (values (m.home_team_id), (m.away_team_id)) as s(team_id)
    cross join lateral (
      select coalesce(
               mm.winner_team_id,
               case when mm.home_score > mm.away_score then m.home_team_id
                    when mm.away_score > mm.home_score then m.away_team_id end) as winner
    ) w
   where m.status = 'confirmed' and w.winner is not null
   group by m.season_id, s.team_id, mm.mode_id, gm.name;

grant select on public.match_results_v, public.team_maps_played_v, public.player_season_stats_v,
  public.team_mode_records_v to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: live scores and broadcast badges update without a refresh.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.matches, public.match_maps;
  end if;
end;
$$;
