-- Season hub: an optional banner image per season, uploaded by the owner.
-- Stored in its own public bucket season-media at {season_id}/banner-<timestamp>.webp; the URL goes
-- in seasons.banner_url (owner-only writes through the existing seasons policy; audited by the
-- audit_staff_change trigger already on seasons).

alter table public.seasons
  add column banner_url text
  constraint seasons_banner_url_https check (banner_url is null or banner_url ~ '^https://');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('season-media', 'season-media', true, 3 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Public bucket: files are served by URL; no select policy, so listing stays closed.
create policy "season-media: owner uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'season-media'
    and (select public.is_owner())
    and public.try_uuid((storage.foldername(name))[1]) is not null
  );

create policy "season-media: owner replaces"
  on storage.objects for update to authenticated
  using (bucket_id = 'season-media' and (select public.is_owner()));

create policy "season-media: owner deletes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'season-media' and (select public.is_owner()));
