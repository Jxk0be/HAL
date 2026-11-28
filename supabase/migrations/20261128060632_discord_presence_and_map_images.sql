-- 1) Discord server membership, recorded by the discord-sync function each time it syncs a user
--    (GET guild member: found = in the server, Unknown Member = not). Service role only; the site
--    reads it through the two functions below, never the table.
create table public.discord_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  in_server boolean not null,
  checked_at timestamptz not null default now()
);
alter table public.discord_presence enable row level security;
revoke all on public.discord_presence from anon, authenticated;

comment on table public.discord_presence is
  'Whether each linked user is in the league Discord server, as of checked_at. Written by discord-sync (service role).';

-- Active roster of a team with each player's Discord status (null = not checked yet).
-- Only the team's own players and admins get rows.
create function public.team_discord_presence(p_team_id uuid)
returns table (user_id uuid, in_server boolean, checked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select tm.user_id, dp.in_server, dp.checked_at
  from public.team_members tm
  left join public.discord_presence dp on dp.user_id = tm.user_id
  where tm.team_id = p_team_id
    and tm.left_at is null
    and tm.is_emergency = false
    and (public.is_on_team(p_team_id) or public.is_admin());
$$;
revoke execute on function public.team_discord_presence(uuid) from public, anon;
grant execute on function public.team_discord_presence(uuid) to authenticated;

-- The signed-in user's own status (no row = not checked yet).
create function public.my_discord_presence()
returns table (in_server boolean, checked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select dp.in_server, dp.checked_at
  from public.discord_presence dp
  where dp.user_id = auth.uid();
$$;
revoke execute on function public.my_discord_presence() from public, anon;
grant execute on function public.my_discord_presence() to authenticated;

-- 2) Map artwork for the public map pool (calling-card backgrounds). Admins upload to the public
--    map-media bucket at {map_id}/art-<timestamp>.webp; the URL goes in maps.image_url (admins
--    already write maps through the existing policy; audited by the trigger on maps).
alter table public.maps
  add column image_url text
  constraint maps_image_url_https check (image_url is null or image_url ~ '^https://');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('map-media', 'map-media', true, 3 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Public bucket: files are served by URL; no select policy, so listing stays closed.
create policy "map-media: admin uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'map-media'
    and (select public.is_admin())
    and public.try_uuid((storage.foldername(name))[1]) is not null
  );

create policy "map-media: admin replaces"
  on storage.objects for update to authenticated
  using (bucket_id = 'map-media' and (select public.is_admin()));

create policy "map-media: admin deletes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'map-media' and (select public.is_admin()));
