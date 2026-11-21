-- Full player leaderboard: every player with data, no minimum-maps rule, and an "incomplete data"
-- marker that is set automatically or by an admin.
--
-- A player is on a season's leaderboard if they have a confirmed stat line, were checked in for a
-- confirmed match, or an admin flagged them. Their row is marked incomplete when:
--   - one of their stat lines is stuck in an unresolved mismatch (it isn't counted until resolved),
--   - they were checked in for a map where their team has fewer than 4 stat lines and they have
--     none (their numbers for that map are missing), or
--   - an admin flagged them (player_stat_flags), e.g. when a scoreboard could not be recovered.

create table public.player_stat_flags (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  note text check (note is null or length(note) <= 200),
  flagged_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, user_id)
);
create index player_stat_flags_user_idx on public.player_stat_flags (user_id);
create index player_stat_flags_flagged_by_idx on public.player_stat_flags (flagged_by);

create trigger set_updated_at before update on public.player_stat_flags
  for each row execute function public.set_updated_at();
create trigger audit_staff_change after insert or update or delete on public.player_stat_flags
  for each row execute function public.audit_staff_change();

-- Admins flag players, but not themselves or a teammate this season (recusal).
create function public.can_flag_player_stats(p_season_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
     and p_user_id <> (select auth.uid())
     and not exists (
       select 1
         from public.team_members mine
         join public.team_members theirs on theirs.team_id = mine.team_id
        where mine.user_id = (select auth.uid())
          and theirs.user_id = p_user_id
          and mine.season_id = p_season_id
          and mine.left_at is null and theirs.left_at is null
     );
$$;
revoke execute on function public.can_flag_player_stats(uuid, uuid) from public, anon;
grant execute on function public.can_flag_player_stats(uuid, uuid) to authenticated;

alter table public.player_stat_flags enable row level security;
create policy "anyone reads stat flags" on public.player_stat_flags
  for select to anon, authenticated using (true);
create policy "admins add stat flags" on public.player_stat_flags
  for insert to authenticated with check (public.can_flag_player_stats(season_id, user_id));
create policy "admins edit stat flags" on public.player_stat_flags
  for update to authenticated
  using (public.can_flag_player_stats(season_id, user_id))
  with check (public.can_flag_player_stats(season_id, user_id));
create policy "admins remove stat flags" on public.player_stat_flags
  for delete to authenticated using (public.can_flag_player_stats(season_id, user_id));

-- The leaderboard. SECURITY DEFINER so the public sees the incomplete marker (check-ins and
-- mismatches themselves stay private); it returns aggregates and Activision IDs only.
create function public.season_leaderboard(p_season_id uuid)
returns table (
  user_id uuid,
  activision_id text,
  avatar_url text,
  team_id uuid,
  team_name text,
  team_tag text,
  maps_played int,
  kills int,
  deaths int,
  kd numeric,
  plus_minus int,
  avg_score int,
  incomplete boolean,
  incomplete_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  with cm as (
    select m.id from public.matches m where m.season_id = p_season_id and m.status = 'confirmed'
  ),
  stats as (
    select pms.user_id,
           count(*)::int as maps,
           sum(pms.kills)::int as kills,
           sum(pms.deaths)::int as deaths,
           sum(pms.score)::int as score
      from public.player_map_stats pms
      join public.match_maps mm on mm.id = pms.match_map_id
     where mm.match_id in (select id from cm)
     group by pms.user_id
  ),
  checked as (
    select distinct u.user_id
      from public.checkins c
      cross join lateral unnest(c.player_ids) as u(user_id)
     where c.match_id in (select id from cm)
  ),
  open_mismatch as (
    select distinct sm.user_id
      from public.stat_mismatches sm
      join public.match_maps mm on mm.id = sm.match_map_id
     where mm.match_id in (select id from cm)
       and sm.kind = 'player_stat' and sm.resolved_at is null
  ),
  missing_map as (
    select distinct u.user_id
      from public.checkins c
      join public.match_maps mm on mm.match_id = c.match_id
      cross join lateral unnest(c.player_ids) as u(user_id)
     where c.match_id in (select id from cm)
       and (select count(*) from public.player_map_stats x
             where x.match_map_id = mm.id and x.team_id = c.team_id) < 4
       and not exists (select 1 from public.player_map_stats x
                        where x.match_map_id = mm.id and x.user_id = u.user_id)
  ),
  flags as (
    select f.user_id, f.note from public.player_stat_flags f where f.season_id = p_season_id
  ),
  players as (
    select s.user_id from stats s
    union select c.user_id from checked c
    union select f.user_id from flags f
  ),
  current_team as (
    select tm.user_id, t.id, t.name, t.tag
      from public.team_members tm
      join public.teams t on t.id = tm.team_id
     where tm.season_id = p_season_id and tm.left_at is null and not tm.is_emergency
       and t.status <> 'removed'
  )
  select pl.user_id,
         p.activision_id,
         p.avatar_url,
         ct.id,
         ct.name,
         ct.tag,
         coalesce(s.maps, 0),
         coalesce(s.kills, 0),
         coalesce(s.deaths, 0),
         case when coalesce(s.maps, 0) > 0 then round(s.kills::numeric / greatest(s.deaths, 1), 2) end,
         coalesce(s.kills - s.deaths, 0),
         case when coalesce(s.maps, 0) > 0 then round(s.score::numeric / s.maps)::int end,
         (f.user_id is not null or om.user_id is not null or mm.user_id is not null),
         case
           when f.user_id is not null then coalesce(nullif(btrim(f.note), ''), 'Marked incomplete by league staff')
           when om.user_id is not null then 'Some stats are waiting on an admin to resolve a mismatch'
           when mm.user_id is not null then 'Stats are missing for at least one map they played'
         end
    from players pl
    join public.profiles p on p.id = pl.user_id
    left join stats s on s.user_id = pl.user_id
    left join current_team ct on ct.user_id = pl.user_id
    left join flags f on f.user_id = pl.user_id
    left join open_mismatch om on om.user_id = pl.user_id
    left join missing_map mm on mm.user_id = pl.user_id
   order by coalesce(s.kills, 0) desc, p.activision_id;
$$;
revoke execute on function public.season_leaderboard(uuid) from public;
grant execute on function public.season_leaderboard(uuid) to anon, authenticated;
