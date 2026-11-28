-- Public, read-only view of 8s for the site's /8s page. The 8s tables stay service-role only; this
-- SECURITY DEFINER function returns the queue size, live matches, the last 10 results and the
-- leaderboard. Names follow the site's privacy rule: signed-in callers get the Discord name when
-- there is one, logged-out callers only ever get Activision IDs. Queue members are listed only to
-- signed-in callers. Never returns Discord ids.
create function public.eights_public_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (select (select auth.uid()) is not null as signed_in),
  names as (
    select p.id,
           case when (select signed_in from viewer)
                then coalesce(p.discord_username, p.activision_id, 'Player')
                else coalesce(p.activision_id, 'Player') end as name
      from public.profiles p
  ),
  side as (
    select ep.match_id, ep.team, jsonb_agg(n.name order by n.name) as players
      from public.eights_players ep
      join names n on n.id = ep.user_id
     group by ep.match_id, ep.team
  )
  select jsonb_build_object(
    'queue_count', (select count(*) from public.eights_queue q where q.joined_at > now() - interval '2 hours'),
    'queue', case when (select signed_in from viewer) then coalesce((
        select jsonb_agg(n.name order by q.joined_at)
          from public.eights_queue q join names n on n.id = q.user_id
         where q.joined_at > now() - interval '2 hours'), '[]'::jsonb)
      else '[]'::jsonb end,
    'live', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'number', m.number, 'status', m.status, 'mode', m.mode_name, 'map', m.map_name,
               'vote_ends_at', m.vote_ends_at, 'created_at', m.created_at,
               'team_a', coalesce(a.players, '[]'::jsonb), 'team_b', coalesce(b.players, '[]'::jsonb))
             order by m.created_at)
        from public.eights_matches m
        left join side a on a.match_id = m.id and a.team = 'a'
        left join side b on b.match_id = m.id and b.team = 'b'
       where m.status in ('voting', 'live')), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(r order by r->>'resolved_at' desc)
        from (
          select jsonb_build_object(
                   'id', m.id, 'number', m.number, 'mode', m.mode_name, 'map', m.map_name, 'winner', m.winner,
                   'resolved_at', coalesce(m.resolved_at, m.created_at),
                   'team_a', coalesce(a.players, '[]'::jsonb), 'team_b', coalesce(b.players, '[]'::jsonb)) as r
            from public.eights_matches m
            left join side a on a.match_id = m.id and a.team = 'a'
            left join side b on b.match_id = m.id and b.team = 'b'
           where m.status = 'confirmed'
           order by coalesce(m.resolved_at, m.created_at) desc
           limit 10) t), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', l.user_id, 'name', n.name, 'wins', l.wins, 'losses', l.losses,
                                          'played', l.played, 'win_pct', l.win_pct)
             order by l.wins desc, l.win_pct desc, l.played desc)
        from public.eights_leaderboard(15) l
        join names n on n.id = l.user_id), '[]'::jsonb)
  );
$$;

revoke execute on function public.eights_public_state() from public;
grant execute on function public.eights_public_state() to anon, authenticated;
