-- Season announcements (Admin → Announcements). The texts are built by the bot from the season
-- settings (_shared/announcements.ts); the database keeps:
--   - announcement_settings: which announcements post automatically (admins toggle them)
--   - announcement_posts: what was posted, so automatic posts happen once per season and offset

create table public.announcement_settings (
  key text primary key check (key in ('signups_open', 'season_countdown', 'roster_changes', 'roster_lock', 'playoffs')),
  auto boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
create index announcement_settings_updated_by_idx on public.announcement_settings (updated_by);
insert into public.announcement_settings (key) values
  ('signups_open'), ('season_countdown'), ('roster_changes'), ('roster_lock'), ('playoffs');

create trigger set_updated_at before update on public.announcement_settings
  for each row execute function public.set_updated_at();
create trigger audit_staff_change after insert or update or delete on public.announcement_settings
  for each row execute function public.audit_staff_change();

alter table public.announcement_settings enable row level security;
create policy "admins read announcement settings" on public.announcement_settings
  for select to authenticated using ((select public.is_admin()));
create policy "admins toggle announcements" on public.announcement_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table public.announcement_posts (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  key text not null,
  -- 'auto:7d' / 'auto:1d' / 'auto:0d' for automatic posts, 'manual:<uuid>' for the button.
  occurrence text not null,
  posted_by uuid references public.profiles (id) on delete set null,
  discord_channel_id text,
  discord_message_id text,
  posted_at timestamptz not null default now(),
  unique (season_id, key, occurrence)
);
create index announcement_posts_posted_by_idx on public.announcement_posts (posted_by);
create index announcement_posts_recent_idx on public.announcement_posts (posted_at desc);

alter table public.announcement_posts enable row level security;
create policy "admins read announcement posts" on public.announcement_posts
  for select to authenticated using ((select public.is_admin()));
-- Writes: the bot (service role) only.
