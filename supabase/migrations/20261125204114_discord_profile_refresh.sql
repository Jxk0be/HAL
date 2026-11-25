-- Discord avatars and display names used to refresh only when someone logged in again (sessions
-- last weeks). The bot now refreshes them: during each user sync, and in small batches on every
-- scheduler run, oldest first. This records when each profile was last checked. Service role only.
alter table public.profiles add column discord_profile_checked_at timestamptz;
create index profiles_discord_profile_checked_idx on public.profiles (discord_profile_checked_at nulls first)
  where discord_id is not null;
