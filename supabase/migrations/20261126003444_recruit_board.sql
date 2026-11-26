-- The public Teams recruiting page: active posts with the team and its open spots right now
-- (team_open_spots isn't callable by visitors, so this returns only these counts).
create function public.recruit_board()
returns table (
  post_id uuid,
  team_id uuid,
  team_name text,
  team_tag text,
  logo_url text,
  team_status public.team_status,
  looking_for text,
  preferred_role text,
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
         p.looking_for, p.preferred_role, p.availability, p.note, p.updated_at,
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
