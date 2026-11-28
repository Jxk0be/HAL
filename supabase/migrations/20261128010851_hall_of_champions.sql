-- Hall of Champions: each completed season's champion per division, derived from the confirmed
-- playoff final (the highest playoff round). Public and read-only. SECURITY DEFINER because the
-- starters come from the final's check-ins (private to the teams); only Activision IDs are exposed,
-- never Discord names or ids. No new table and no writes.
create function public.hall_of_champions()
returns table (
  season_id uuid,
  season_name text,
  division_name text,
  team_id uuid,
  team_name text,
  team_tag text,
  logo_url text,
  opponent_name text,
  opponent_tag text,
  champion_series smallint,
  opponent_series smallint,
  final_at timestamptz,
  starters text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with finals as (
    select distinct on (m.season_id, m.division_id)
      m.*
    from public.matches m
    join public.seasons s on s.id = m.season_id
    where s.status = 'complete'
      and m.stage = 'playoff'
      and m.status in ('confirmed', 'forfeit')
      and m.winner_team_id is not null
    order by m.season_id, m.division_id, m.playoff_round desc nulls last, m.scheduled_at desc
  )
  select
    s.id,
    s.name,
    d.name,
    w.id,
    w.name,
    w.tag,
    w.logo_url,
    l.name,
    l.tag,
    (case when f.winner_team_id = f.home_team_id then f.home_series else f.away_series end)::smallint,
    (case when f.winner_team_id = f.home_team_id then f.away_series else f.home_series end)::smallint,
    f.scheduled_at,
    coalesce(
      (select array_agg(p.activision_id order by p.activision_id)
         from public.checkins c
         join public.profiles p on p.id = any (c.player_ids)
        where c.match_id = f.id and c.team_id = f.winner_team_id and p.activision_id is not null),
      '{}'
    )
  from finals f
  join public.seasons s on s.id = f.season_id
  left join public.divisions d on d.id = f.division_id
  join public.teams w on w.id = f.winner_team_id
  join public.teams l on l.id = case when f.winner_team_id = f.home_team_id then f.away_team_id else f.home_team_id end
  order by f.scheduled_at desc;
$$;

revoke execute on function public.hall_of_champions() from public;
grant execute on function public.hall_of_champions() to anon, authenticated;
