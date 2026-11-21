-- Season admin: team review notes, and saving a whole schedule (or playoff round) in one transaction.

alter table public.teams add column review_note text check (review_note is null or length(review_note) <= 500);

-- Captains can't set the review note (staff only); extend the captain-field guard.
create function public.teams_review_note_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_internal() or public.can_staff_team(old.id) then
    return new;
  end if;
  if new.review_note is distinct from old.review_note then
    raise exception 'Only league staff can set the review note' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger teams_review_note_guard before update on public.teams
  for each row execute function public.teams_review_note_guard();
revoke execute on function public.teams_review_note_guard() from public, anon, authenticated;

/**
 * Create many matches at once (the generated regular season for a division, or a playoff round).
 * p_matches: [{ division_id, week, stage, playoff_round, home_team_id, away_team_id, default_at }]
 * p_replace: first delete the existing not-yet-played matches for the same division/stage/round.
 *
 * Bulk generation is a league-wide action, so it isn't recused per match (the owner's team is in
 * the schedule like everyone else's); editing a single match afterwards is recused as usual.
 * Every inserted match is audit-logged.
 */
create function public.create_matches(p_season_id uuid, p_matches jsonb, p_replace boolean default false)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int := 0;
  v_m jsonb;
  v_keys jsonb;
  v_blocked int;
begin
  if not public.is_admin() then
    raise exception 'Only league staff can create the schedule' using errcode = '42501';
  end if;
  if not exists (select 1 from public.seasons where id = p_season_id) then
    raise exception 'Season not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) = 0 then
    raise exception 'No matches to save' using errcode = 'P0001';
  end if;

  -- The (division, stage, round) groups being written.
  select coalesce(jsonb_agg(distinct jsonb_build_object(
           'division_id', m ->> 'division_id',
           'stage', coalesce(m ->> 'stage', 'regular'),
           'playoff_round', m ->> 'playoff_round')), '[]'::jsonb)
    into v_keys
    from jsonb_array_elements(p_matches) m;

  -- Existing matches in those groups.
  select count(*) into v_blocked
    from public.matches x
    join jsonb_array_elements(v_keys) k
      on x.division_id is not distinct from (k ->> 'division_id')::uuid
     and x.stage::text = k ->> 'stage'
     and x.playoff_round is not distinct from (k ->> 'playoff_round')::smallint
   where x.season_id = p_season_id
     and (not p_replace or x.status not in ('scheduled', 'cancelled'));
  if v_blocked > 0 then
    if p_replace then
      raise exception 'Some of these matches have already started or finished, so the schedule can''t be replaced'
        using errcode = 'P0001';
    end if;
    raise exception 'A schedule already exists for this division. Use Replace to overwrite it.' using errcode = 'P0001';
  end if;

  if p_replace then
    delete from public.matches x
     using jsonb_array_elements(v_keys) k
     where x.season_id = p_season_id
       and x.division_id is not distinct from (k ->> 'division_id')::uuid
       and x.stage::text = k ->> 'stage'
       and x.playoff_round is not distinct from (k ->> 'playoff_round')::smallint;
  end if;

  for v_m in select * from jsonb_array_elements(p_matches) loop
    if not exists (
      select 1 from public.teams t
       where t.id in ((v_m ->> 'home_team_id')::uuid, (v_m ->> 'away_team_id')::uuid)
         and t.season_id = p_season_id and t.status = 'approved'
      having count(*) = 2
    ) then
      raise exception 'Every match needs two different approved teams from this season' using errcode = 'P0001';
    end if;
    insert into public.matches (season_id, division_id, week, stage, playoff_round, home_team_id, away_team_id, default_at, scheduled_at)
    values (
      p_season_id,
      (v_m ->> 'division_id')::uuid,
      (v_m ->> 'week')::smallint,
      coalesce(v_m ->> 'stage', 'regular')::public.match_stage,
      (v_m ->> 'playoff_round')::smallint,
      (v_m ->> 'home_team_id')::uuid,
      (v_m ->> 'away_team_id')::uuid,
      (v_m ->> 'default_at')::timestamptz,
      (v_m ->> 'default_at')::timestamptz
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.create_matches(uuid, jsonb, boolean) from public, anon;
grant execute on function public.create_matches(uuid, jsonb, boolean) to authenticated, service_role;
