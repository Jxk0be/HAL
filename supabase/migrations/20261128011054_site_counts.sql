-- Public counts for the landing page: players (complete, non-staff-only profiles), approved teams in
-- the active season, and confirmed (or forfeited) non-preseason matches. Aggregates only.
create function public.site_counts()
returns table (players bigint, teams bigint, matches bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.profiles p where p.is_player and public.is_profile_complete(p.id)),
    (select count(*) from public.teams t
       join public.seasons s on s.id = t.season_id
      where t.status = 'approved' and s.status in ('signups', 'regular', 'playoffs')),
    (select count(*) from public.matches m
      where m.status in ('confirmed', 'forfeit') and m.stage <> 'preseason');
$$;

revoke execute on function public.site_counts() from public;
grant execute on function public.site_counts() to anon, authenticated;
