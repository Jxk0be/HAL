-- Live Discord boards: bot messages kept in step with the database by discord-scheduler
-- (#team-rosters, #standings, #match-schedule, #sub-board) plus the weekly Player of the Week post.
-- Service role only: the site never reads or writes these.

create table public.discord_boards (
  key text primary key,            -- roster:<team>, standings:<division>, schedule:<season>:<week>, subs:<match>:<team>, potw:<monday>
  channel_id text not null,
  message_id text not null,
  content_hash text not null,
  keep boolean not null default false,  -- one-off posts (Player of the Week) are never cleaned up
  updated_at timestamptz not null default now()
);
alter table public.discord_boards enable row level security;
revoke all on public.discord_boards from anon, authenticated;

-- Free agents who pressed "I'm available" on a #sub-board post.
create table public.sub_volunteers (
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, team_id, user_id)
);
create index sub_volunteers_user_idx on public.sub_volunteers (user_id);
create index sub_volunteers_team_idx on public.sub_volunteers (team_id);
alter table public.sub_volunteers enable row level security;
revoke all on public.sub_volunteers from anon, authenticated;

-- Not on a team in a running season, not banned, profile complete: the same rule as invite search.
create function public.can_emergency_sub(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user_id
       and (p.banned_until is null or p.banned_until <= now())
       and public.is_profile_complete(p.id)
       and not exists (
         select 1 from public.team_members tm
           join public.seasons s on s.id = tm.season_id
          where tm.user_id = p.id and tm.left_at is null and not tm.is_emergency
            and s.status in ('signups', 'regular', 'playoffs')
       )
  );
$$;
revoke execute on function public.can_emergency_sub(uuid) from public, anon, authenticated;
grant execute on function public.can_emergency_sub(uuid) to service_role;

-- Teams that marked players out of an upcoming match (next 7 days) and still need emergency subs.
-- needed = min(4 - available, 2) minus requests already sent and not declined/denied (rule 4.3).
create function public.sub_board()
returns table (
  match_id uuid,
  team_id uuid,
  team_name text,
  team_tag text,
  team_channel_id text,
  opponent_name text,
  opponent_tag text,
  scheduled_at timestamptz,
  needed integer,
  volunteers jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with upcoming as (
    select m.id, m.home_team_id, m.away_team_id, m.scheduled_at
      from public.matches m
     where m.status in ('scheduled', 'checkin_open')
       and m.scheduled_at > now()
       and m.scheduled_at < now() + interval '7 days'
  ),
  sides as (
    select u.id as match_id, u.home_team_id as team_id, u.away_team_id as opp_id, u.scheduled_at from upcoming u
    union all
    select u.id, u.away_team_id, u.home_team_id, u.scheduled_at from upcoming u
  ),
  short as (
    select s.*,
           least(4 - public.available_players(s.match_id, s.team_id), 2)
             - (select count(*)::int from public.roster_requests r
                 where r.match_id = s.match_id and r.team_id = s.team_id
                   and r.type = 'emergency_sub' and r.status in ('pending', 'approved')
                   and r.player_declined_at is null) as needed
      from sides s
     where exists (select 1 from public.match_absences a where a.match_id = s.match_id and a.team_id = s.team_id)
  )
  select sh.match_id, sh.team_id, t.name, t.tag, t.discord_channel_id, o.name, o.tag, sh.scheduled_at, sh.needed,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'user_id', p.id, 'discord_id', p.discord_id,
                    'name', coalesce(p.activision_id, p.discord_username)) order by v.created_at)
             from public.sub_volunteers v
             join public.profiles p on p.id = v.user_id
            where v.match_id = sh.match_id and v.team_id = sh.team_id
              and public.can_emergency_sub(v.user_id)
         ), '[]'::jsonb)
    from short sh
    join public.teams t on t.id = sh.team_id
    join public.teams o on o.id = sh.opp_id
   where sh.needed > 0
   order by sh.scheduled_at, t.name;
$$;
revoke execute on function public.sub_board() from public, anon, authenticated;
grant execute on function public.sub_board() to service_role;

-- The #sub-board button. Adds (or, with p_available = false, removes) the player as a volunteer.
-- Returns 'added', 'already', or 'removed'.
create function public.volunteer_for_sub_as(p_actor uuid, p_match_id uuid, p_team_id uuid, p_available boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not p_available then
    delete from public.sub_volunteers where match_id = p_match_id and team_id = p_team_id and user_id = p_actor;
    return 'removed';
  end if;
  if not public.can_emergency_sub(p_actor) then
    raise exception 'Only players who aren''t on a team this season can be emergency subs. Finish your profile first if you haven''t.'
      using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.sub_board() b where b.match_id = p_match_id and b.team_id = p_team_id) then
    raise exception 'This team doesn''t need a sub any more.' using errcode = 'P0001';
  end if;
  insert into public.sub_volunteers (match_id, team_id, user_id) values (p_match_id, p_team_id, p_actor)
  on conflict do nothing;
  return case when found then 'added' else 'already' end;
end;
$$;
revoke execute on function public.volunteer_for_sub_as(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.volunteer_for_sub_as(uuid, uuid, uuid, boolean) to service_role;

-- Player of the Week: confirmed matches in [p_from, p_to), at least 2 maps, best average score.
create function public.week_top_players(p_from timestamptz, p_to timestamptz, p_limit integer default 3)
returns table (
  user_id uuid,
  discord_id text,
  name text,
  team_tag text,
  maps integer,
  kills integer,
  deaths integer,
  kd numeric,
  avg_score integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with cm as (
    select m.id from public.matches m
     where m.status = 'confirmed' and m.scheduled_at >= p_from and m.scheduled_at < p_to
  ),
  s as (
    select pms.user_id, pms.team_id,
           count(*)::int as maps, sum(pms.kills)::int as kills, sum(pms.deaths)::int as deaths, sum(pms.score)::int as score
      from public.player_map_stats pms
      join public.match_maps mm on mm.id = pms.match_map_id
     where mm.match_id in (select id from cm)
     group by pms.user_id, pms.team_id
  )
  select s.user_id, p.discord_id, coalesce(p.activision_id, p.discord_username), t.tag,
         s.maps, s.kills, s.deaths, round(s.kills::numeric / greatest(s.deaths, 1), 2),
         round(s.score::numeric / s.maps)::int
    from s
    join public.profiles p on p.id = s.user_id
    left join public.teams t on t.id = s.team_id
   where s.maps >= 2
   order by s.score::numeric / s.maps desc, s.kills desc
   limit least(greatest(coalesce(p_limit, 3), 1), 10);
$$;
revoke execute on function public.week_top_players(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.week_top_players(timestamptz, timestamptz, integer) to service_role;
