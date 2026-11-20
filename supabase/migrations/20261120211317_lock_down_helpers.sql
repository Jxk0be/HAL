-- Permission helpers are only needed by signed-in users' policies; anon never calls them.
-- (Signed-in callers can only learn about themselves, which is intended.)

-- Anon reads seasons without a helper call.
drop policy "seasons are public once out of draft" on public.seasons;
create policy "anyone reads published seasons" on public.seasons
  for select to anon using (status <> 'draft');
create policy "signed-in read published seasons; staff read drafts" on public.seasons
  for select to authenticated using (status <> 'draft' or (select public.is_admin()));

revoke execute on function
  public.has_role(public.staff_role), public.is_owner(), public.is_admin(), public.is_caster(),
  public.my_team_ids(uuid), public.is_captain_of(uuid), public.is_on_team(uuid),
  public.can_staff_team(uuid), public.is_party_to_match(uuid), public.can_staff_match(uuid),
  public.is_captain_in_match(uuid, uuid), public.match_of_map(uuid), public.match_of_dispute(uuid),
  public.match_captain_team(uuid), public.is_internal(), public.try_uuid(text)
  from public, anon;

grant execute on function
  public.has_role(public.staff_role), public.is_owner(), public.is_admin(), public.is_caster(),
  public.my_team_ids(uuid), public.is_captain_of(uuid), public.is_on_team(uuid),
  public.can_staff_team(uuid), public.is_party_to_match(uuid), public.can_staff_match(uuid),
  public.is_captain_in_match(uuid, uuid), public.match_of_map(uuid), public.match_of_dispute(uuid),
  public.match_captain_team(uuid), public.is_internal(), public.try_uuid(text)
  to authenticated, service_role;
