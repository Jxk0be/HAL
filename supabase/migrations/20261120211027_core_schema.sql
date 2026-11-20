-- HAL core schema: enums, tables, indexes, updated_at triggers.
-- Permissions (helpers, RLS, rule triggers) live in the following migrations.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.platform as enum ('playstation', 'xbox', 'pc');
create type public.staff_role as enum ('owner', 'admin', 'caster');
create type public.season_status as enum ('draft', 'signups', 'regular', 'playoffs', 'complete');
create type public.team_status as enum ('pending', 'approved', 'removed');
create type public.member_role as enum ('starter', 'sub');
create type public.roster_request_type as enum ('add', 'drop', 'emergency_sub');
create type public.request_status as enum ('pending', 'approved', 'denied');
create type public.match_stage as enum ('regular', 'playoff');
create type public.match_status as enum (
  'scheduled', 'checkin_open', 'live', 'awaiting_reports', 'disputed', 'confirmed', 'forfeit', 'cancelled'
);
create type public.stats_status as enum ('pending', 'confirmed', 'mismatch');
create type public.submission_source as enum ('site', 'discord');
create type public.mismatch_kind as enum ('map_score', 'player_stat');
create type public.reschedule_status as enum ('pending', 'accepted', 'declined', 'expired', 'cancelled');
create type public.dispute_status as enum ('open', 'resolved');
create type public.penalty_type as enum (
  'warning', 'map_forfeit', 'series_forfeit', 'suspension', 'ban', 'team_removal', 'other'
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  discord_id text unique,                    -- private: hidden from the API by column grants
  discord_username text,
  avatar_url text,
  activision_id text check (activision_id is null or length(activision_id) between 2 and 64),
  platform public.platform,
  age_confirmed_at timestamptz,
  is_free_agent boolean not null default false,
  banned_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.staff_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index staff_roles_granted_by_idx on public.staff_roles (granted_by);

-- ---------------------------------------------------------------------------
-- Seasons and divisions
-- ---------------------------------------------------------------------------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status public.season_status not null default 'draft',
  signups_open_at timestamptz,
  starts_on date,
  regular_weeks smallint not null default 8 check (regular_weeks between 1 and 20),
  matches_per_week smallint not null default 2 check (matches_per_week between 1 and 7),
  playoff_teams smallint not null default 8 check (playoff_teams between 2 and 32),
  match_nights text[] not null default array['tue', 'thu']
    check (match_nights <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  match_time time not null default '21:00',
  timezone text not null default 'America/New_York',
  roster_lock_at timestamptz,
  max_roster smallint not null default 7 check (max_roster between 4 and 12),
  max_roster_changes smallint not null default 3 check (max_roster_changes >= 0),
  prize_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one season in an active state at a time.
create unique index seasons_one_active_idx on public.seasons ((true))
  where status in ('signups', 'regular', 'playoffs');

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  name text not null,
  tier smallint not null default 1 check (tier >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, name)
);

-- ---------------------------------------------------------------------------
-- Teams and rosters
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  division_id uuid references public.divisions (id) on delete set null,
  name text not null check (length(btrim(name)) between 2 and 40),
  tag text not null check (tag ~ '^[A-Za-z0-9]{2,5}$'),
  logo_url text,
  captain_id uuid not null references public.profiles (id),
  co_captain_id uuid references public.profiles (id) on delete set null,
  status public.team_status not null default 'pending',
  roster_changes_used smallint not null default 0 check (roster_changes_used >= 0),
  forfeit_count smallint not null default 0 check (forfeit_count >= 0),
  discord_role_id text,
  discord_channel_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (co_captain_id is null or co_captain_id <> captain_id)
);
create unique index teams_season_name_idx on public.teams (season_id, lower(name));
create unique index teams_season_tag_idx on public.teams (season_id, upper(tag));
create index teams_division_idx on public.teams (division_id);
create index teams_captain_idx on public.teams (captain_id);
create index teams_co_captain_idx on public.teams (co_captain_id);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade, -- copied from the team by trigger
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'starter',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  is_emergency boolean not null default false,
  emergency_match_id uuid,                   -- FK added after matches exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_emergency or emergency_match_id is not null)
);
-- One active (non-emergency) team per player per season.
create unique index team_members_one_team_per_season_idx on public.team_members (season_id, user_id)
  where left_at is null and not is_emergency;
create index team_members_team_idx on public.team_members (team_id) where left_at is null;
create index team_members_user_idx on public.team_members (user_id);
create index team_members_emergency_match_idx on public.team_members (emergency_match_id);

-- ---------------------------------------------------------------------------
-- Game data (admin-editable; seeded by the owner)
-- ---------------------------------------------------------------------------
create table public.game_modes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.maps (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.map_modes (
  map_id uuid not null references public.maps (id) on delete cascade,
  mode_id uuid not null references public.game_modes (id) on delete cascade,
  primary key (map_id, mode_id)
);
create index map_modes_mode_idx on public.map_modes (mode_id);

-- Gentlemen's Agreements: optional per mode (null = applies to all modes).
create table public.gentlemens_agreements (
  id uuid primary key default gen_random_uuid(),
  mode_id uuid references public.game_modes (id) on delete cascade,
  text text not null,
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gentlemens_agreements_mode_idx on public.gentlemens_agreements (mode_id);

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  division_id uuid references public.divisions (id) on delete set null,
  week smallint not null check (week >= 1),
  stage public.match_stage not null default 'regular',
  playoff_round smallint check (playoff_round is null or playoff_round >= 1),
  home_team_id uuid not null references public.teams (id),
  away_team_id uuid not null references public.teams (id),
  default_at timestamptz not null,
  scheduled_at timestamptz not null,
  status public.match_status not null default 'scheduled',
  home_series smallint check (home_series between 0 and 3),
  away_series smallint check (away_series between 0 and 3),
  winner_team_id uuid references public.teams (id),
  forfeit_team_id uuid references public.teams (id),
  broadcast_live boolean not null default false,
  broadcast_url text check (broadcast_url is null or broadcast_url ~ '^https://'),
  broadcast_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  check (winner_team_id is null or winner_team_id in (home_team_id, away_team_id)),
  check (forfeit_team_id is null or forfeit_team_id in (home_team_id, away_team_id)),
  check ((stage = 'playoff') = (playoff_round is not null))
);
create index matches_season_week_idx on public.matches (season_id, week);
create index matches_division_idx on public.matches (division_id);
create index matches_home_idx on public.matches (home_team_id);
create index matches_away_idx on public.matches (away_team_id);
create index matches_scheduled_idx on public.matches (scheduled_at);
create index matches_winner_idx on public.matches (winner_team_id);
create index matches_forfeit_idx on public.matches (forfeit_team_id);
create index matches_broadcast_by_idx on public.matches (broadcast_by);
create index matches_live_idx on public.matches (id) where broadcast_live;

alter table public.team_members
  add constraint team_members_emergency_match_fkey
  foreign key (emergency_match_id) references public.matches (id) on delete cascade;

create table public.match_maps (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  map_number smallint not null check (map_number between 1 and 5),
  mode_id uuid not null references public.game_modes (id),
  map_id uuid not null references public.maps (id),
  home_score integer check (home_score >= 0),
  away_score integer check (away_score >= 0),
  winner_team_id uuid references public.teams (id),
  stats_status public.stats_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, map_number)
);
create index match_maps_mode_idx on public.match_maps (mode_id);
create index match_maps_map_idx on public.match_maps (map_id);
create index match_maps_winner_idx on public.match_maps (winner_team_id);

create table public.report_submissions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  home_series smallint not null check (home_series between 0 and 3),
  away_series smallint not null check (away_series between 0 and 3),
  -- [{ number, mode_id, map_id, home_score, away_score }]
  maps jsonb not null default '[]'::jsonb check (jsonb_typeof(maps) = 'array'),
  -- [{ number, players: [{ user_id, team_id, kills, deaths, score }] }]
  player_stats jsonb not null default '[]'::jsonb check (jsonb_typeof(player_stats) = 'array'),
  screenshot_paths text[] not null default '{}',
  source public.submission_source not null default 'site',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, team_id)
);
create index report_submissions_team_idx on public.report_submissions (team_id);
create index report_submissions_submitted_by_idx on public.report_submissions (submitted_by);

-- Confirmed values only.
create table public.player_map_stats (
  id uuid primary key default gen_random_uuid(),
  match_map_id uuid not null references public.match_maps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  kills integer not null check (kills >= 0),
  deaths integer not null check (deaths >= 0),
  score integer not null check (score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_map_id, user_id)
);
create index player_map_stats_user_idx on public.player_map_stats (user_id);
create index player_map_stats_team_idx on public.player_map_stats (team_id);

create table public.stat_mismatches (
  id uuid primary key default gen_random_uuid(),
  match_map_id uuid not null references public.match_maps (id) on delete cascade,
  kind public.mismatch_kind not null,
  user_id uuid references public.profiles (id) on delete cascade,
  field text not null,
  home_value text,
  away_value text,
  resolved_value text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'player_stat') = (user_id is not null))
);
create index stat_mismatches_map_idx on public.stat_mismatches (match_map_id);
create index stat_mismatches_user_idx on public.stat_mismatches (user_id);
create index stat_mismatches_resolved_by_idx on public.stat_mismatches (resolved_by);
create index stat_mismatches_open_idx on public.stat_mismatches (created_at) where resolved_at is null;

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  captain_id uuid not null references public.profiles (id),
  player_ids uuid[] not null check (cardinality(player_ids) = 4),
  checked_in_at timestamptz not null default now(),
  source public.submission_source not null default 'site',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, team_id)
);
create index checkins_team_idx on public.checkins (team_id);
create index checkins_captain_idx on public.checkins (captain_id);

create table public.reschedule_requests (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  requested_by_team_id uuid not null references public.teams (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  proposed_at timestamptz not null,
  status public.reschedule_status not null default 'pending',
  responded_by uuid references public.profiles (id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reschedule_requests_match_idx on public.reschedule_requests (match_id);
create index reschedule_requests_team_idx on public.reschedule_requests (requested_by_team_id);
create index reschedule_requests_requested_by_idx on public.reschedule_requests (requested_by);
create index reschedule_requests_responded_by_idx on public.reschedule_requests (responded_by);
create unique index reschedule_requests_one_pending_idx on public.reschedule_requests (match_id)
  where status = 'pending';

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  opened_by uuid not null references public.profiles (id),
  reason text not null check (length(btrim(reason)) between 10 and 4000),
  status public.dispute_status not null default 'open',
  resolution text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  discord_thread_id text,                    -- private: hidden from the API by column grants
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index disputes_match_idx on public.disputes (match_id);
create index disputes_team_idx on public.disputes (team_id);
create index disputes_opened_by_idx on public.disputes (opened_by);
create index disputes_resolved_by_idx on public.disputes (resolved_by);

-- Evidence is private (parties + staff), so it lives apart from the public dispute row.
create table public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  storage_path text,                         -- object in the private "screenshots" bucket
  url text check (url is null or url ~ '^https://'),
  note text,
  added_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (storage_path is not null or url is not null)
);
create index dispute_evidence_dispute_idx on public.dispute_evidence (dispute_id);
create index dispute_evidence_added_by_idx on public.dispute_evidence (added_by);

create table public.free_agent_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_id uuid references public.seasons (id) on delete cascade,
  platform public.platform not null,
  preferred_role text check (preferred_role is null or length(preferred_role) <= 60),
  availability text check (availability is null or length(availability) <= 280),
  note text check (note is null or length(note) <= 1000),
  active boolean not null default true,
  discord_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index free_agent_posts_one_active_idx on public.free_agent_posts (user_id) where active;
create index free_agent_posts_season_idx on public.free_agent_posts (season_id);

create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  match_id uuid references public.matches (id) on delete set null,
  type public.penalty_type not null,
  note text,
  issued_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (team_id is not null or user_id is not null)
);
create index penalties_team_idx on public.penalties (team_id);
create index penalties_user_idx on public.penalties (user_id);
create index penalties_match_idx on public.penalties (match_id);
create index penalties_issued_by_idx on public.penalties (issued_by);

-- ---------------------------------------------------------------------------
-- Audit log and settings
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role text,
  action text not null,
  table_name text,
  row_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'seasons', 'divisions', 'teams', 'team_members', 'game_modes', 'maps',
    'gentlemens_agreements', 'matches', 'match_maps', 'report_submissions', 'player_map_stats',
    'stat_mismatches', 'checkins', 'reschedule_requests', 'disputes', 'free_agent_posts',
    'penalties', 'app_settings'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- RLS on every table (policies come in the RLS migration; until then nothing is reachable).
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;
