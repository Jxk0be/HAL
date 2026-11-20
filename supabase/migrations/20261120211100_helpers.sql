-- HAL: roster requests table, profile auto-creation and permission helpers.
-- Helpers are SECURITY DEFINER (they read tables the caller may not see) and STABLE.

-- ---------------------------------------------------------------------------
-- Roster requests (adds, drops, emergency subs awaiting admin approval)
-- ---------------------------------------------------------------------------
create table public.roster_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.roster_request_type not null,
  match_id uuid references public.matches (id) on delete cascade,
  status public.request_status not null default 'pending',
  requested_by uuid not null references public.profiles (id),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  note text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((type = 'emergency_sub') = (match_id is not null))
);
create index roster_requests_team_idx on public.roster_requests (team_id);
create index roster_requests_user_idx on public.roster_requests (user_id);
create index roster_requests_match_idx on public.roster_requests (match_id);
create index roster_requests_requested_by_idx on public.roster_requests (requested_by);
create index roster_requests_reviewed_by_idx on public.roster_requests (reviewed_by);
create index roster_requests_pending_idx on public.roster_requests (created_at) where status = 'pending';
create unique index roster_requests_one_pending_idx on public.roster_requests (team_id, user_id, type)
  where status = 'pending';

alter table public.roster_requests enable row level security;
create trigger set_updated_at before update on public.roster_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile row for every new auth user (Discord OAuth metadata)
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, discord_id, discord_username, avatar_url)
  values (
    new.id,
    coalesce(meta ->> 'provider_id', meta ->> 'sub'),
    coalesce(meta -> 'custom_claims' ->> 'global_name', meta ->> 'full_name', meta ->> 'name', meta ->> 'user_name'),
    meta ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep Discord name/avatar in sync when the auth metadata changes (every Discord login refreshes it).
create function public.handle_user_meta_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  update public.profiles
     set discord_username = coalesce(meta -> 'custom_claims' ->> 'global_name', meta ->> 'full_name', meta ->> 'name', discord_username),
         avatar_url = coalesce(meta ->> 'avatar_url', avatar_url),
         discord_id = coalesce(discord_id, meta ->> 'provider_id', meta ->> 'sub')
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_meta_updated
  after update of raw_user_meta_data on auth.users
  for each row
  when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute function public.handle_user_meta_update();

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
create function public.has_role(p_role public.staff_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_roles
     where user_id = (select auth.uid()) and role = p_role
  );
$$;

create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('owner');
$$;

-- Owner or admin.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_roles
     where user_id = (select auth.uid()) and role in ('owner', 'admin')
  );
$$;

create function public.is_caster()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('caster');
$$;

-- ---------------------------------------------------------------------------
-- Team helpers
-- ---------------------------------------------------------------------------
-- Teams the current user is actively rostered on (including emergency spots) in a season.
create function public.my_team_ids(p_season_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct tm.team_id
    from public.team_members tm
   where tm.user_id = (select auth.uid())
     and tm.season_id = p_season_id
     and tm.left_at is null;
$$;

-- Captain or co-captain of the team.
create function public.is_captain_of(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teams t
     where t.id = p_team_id
       and (select auth.uid()) in (t.captain_id, t.co_captain_id)
  );
$$;

-- Actively rostered on the team (any role, including an emergency spot or captaincy).
create function public.is_on_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.team_members tm
       where tm.team_id = p_team_id
         and tm.user_id = (select auth.uid())
         and tm.left_at is null
    )
    or public.is_captain_of(p_team_id);
$$;

-- Staff may act on a team only if they are not on it (recusal).
create function public.can_staff_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() and not public.is_on_team(p_team_id);
$$;

-- ---------------------------------------------------------------------------
-- Match helpers
-- ---------------------------------------------------------------------------
-- True if the current user is actively rostered on either team in the match.
create function public.is_party_to_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches m
     where m.id = p_match_id
       and (public.is_on_team(m.home_team_id) or public.is_on_team(m.away_team_id))
  );
$$;

-- Staff action on a match: admin (or owner) AND not on either team. Use for every
-- staff write on matches and their children.
create function public.can_staff_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() and not public.is_party_to_match(p_match_id);
$$;

-- Captain/co-captain of p_team_id, and that team plays in the match.
create function public.is_captain_in_match(p_match_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches m
     where m.id = p_match_id
       and p_team_id in (m.home_team_id, m.away_team_id)
  ) and public.is_captain_of(p_team_id);
$$;

-- Match id for a match_map (used by child-table policies).
create function public.match_of_map(p_match_map_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select match_id from public.match_maps where id = p_match_map_id;
$$;

-- Safe text -> uuid for storage paths (null when malformed).
create function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Helpers are for policies and the app; anon/authenticated may call them, nobody else needs to.
revoke execute on function
  public.handle_new_user(), public.handle_user_meta_update()
  from public, anon, authenticated;
