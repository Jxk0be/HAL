-- HAL storage buckets.
-- screenshots (private): {matches|disputes}/{match_id}/{team_id}/<file>
--   read: either team in the match, and staff; write: captains of {team_id} when that team plays the match.
-- team-logos (public): {team_id}/<file>; write: that team's captains and staff.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('screenshots', 'screenshots', false, 8 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp']),
  ('team-logos', 'team-logos', true, 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "screenshots: parties and staff read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] in ('matches', 'disputes')
    and (
      (select public.is_admin())
      or public.is_party_to_match(public.try_uuid((storage.foldername(name))[2]))
    )
  );

create policy "screenshots: captains upload for their team"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] in ('matches', 'disputes')
    and public.is_captain_in_match(
      public.try_uuid((storage.foldername(name))[2]),
      public.try_uuid((storage.foldername(name))[3])
    )
  );

create policy "screenshots: captains replace their own uploads"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'screenshots'
    and owner_id = (select auth.uid())::text
  )
  with check (
    bucket_id = 'screenshots'
    and public.is_captain_in_match(
      public.try_uuid((storage.foldername(name))[2]),
      public.try_uuid((storage.foldername(name))[3])
    )
  );

create policy "screenshots: staff delete (recused)"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'screenshots'
    and public.can_staff_match(public.try_uuid((storage.foldername(name))[2]))
  );

-- Public bucket: files are served by URL; no select policy, so listing stays closed.
create policy "team-logos: captains and staff upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-logos'
    and (
      public.is_captain_of(public.try_uuid((storage.foldername(name))[1]))
      or public.can_staff_team(public.try_uuid((storage.foldername(name))[1]))
    )
  );

create policy "team-logos: captains and staff replace"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'team-logos'
    and (
      public.is_captain_of(public.try_uuid((storage.foldername(name))[1]))
      or public.can_staff_team(public.try_uuid((storage.foldername(name))[1]))
    )
  );

create policy "team-logos: captains and staff delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'team-logos'
    and (
      public.is_captain_of(public.try_uuid((storage.foldername(name))[1]))
      or public.can_staff_team(public.try_uuid((storage.foldername(name))[1]))
    )
  );
