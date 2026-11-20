-- Replace "for all" write policies with insert/update/delete policies so each table has a single
-- SELECT policy per role (avoids the multiple_permissive_policies performance lint).
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('app_settings',          'owner manages settings',              '(select public.is_owner())'),
      ('divisions',             'owner manages divisions',             '(select public.is_owner())'),
      ('seasons',               'owner manages seasons',               '(select public.is_owner())'),
      ('game_modes',            'admins manage game_modes',            '(select public.is_admin())'),
      ('maps',                  'admins manage maps',                  '(select public.is_admin())'),
      ('map_modes',             'admins manage map_modes',             '(select public.is_admin())'),
      ('gentlemens_agreements', 'admins manage gentlemens_agreements', '(select public.is_admin())'),
      ('match_maps',            'staff write match maps (recused)',    '(select public.can_staff_match(match_id))'),
      ('player_map_stats',      'staff write stats (recused)',         '(select public.can_staff_match(public.match_of_map(match_map_id)))'),
      ('stat_mismatches',       'staff resolve mismatches (recused)',  '(select public.can_staff_match(public.match_of_map(match_map_id)))'),
      ('penalties',             'staff issue penalties (recused)',
         '((select public.is_admin()) and (team_id is null or (select public.can_staff_team(team_id))) and (match_id is null or (select public.can_staff_match(match_id))))')
    ) as v(tbl, pol, expr)
  loop
    execute format('drop policy %I on public.%I', r.pol, r.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                   r.pol || ': insert', r.tbl, r.expr);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                   r.pol || ': update', r.tbl, r.expr, r.expr);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                   r.pol || ': delete', r.tbl, r.expr);
  end loop;
end;
$$;
