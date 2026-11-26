-- Team recruiting posts: a captain says the team is looking for a starter or a sub. The post is on
-- the site's Teams recruiting page and the bot posts it in #teams-recruiting (channel key
-- 'recruiting'). Players press "I'm interested" (site or Discord) and the team channel tells the
-- captains. One active post per team; it comes down by itself once that kind of spot is full, the
-- team is removed, or rosters lock.
--
-- All writes go through functions; Discord follows through the outbox:
--   recruit_changed  {post_id}                      post, edit or delete the #teams-recruiting card
--   recruit_deleted  {channel_id, message_id}       the post row is gone (team deleted)
--   recruit_interest {post_id, user_id}             tell the team channel

create table public.team_recruit_posts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  looking_for text not null check (looking_for in ('starter', 'sub', 'any')),
  preferred_role text check (preferred_role in ('AR', 'SMG', 'Flex')),
  availability text check (char_length(availability) <= 280),
  note text check (char_length(note) <= 1000),
  active boolean not null default true,
  closed_reason text,
  discord_channel_id text,
  discord_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index team_recruit_posts_one_active on public.team_recruit_posts (team_id) where active;
create index team_recruit_posts_season_idx on public.team_recruit_posts (season_id) where active;
alter table public.team_recruit_posts enable row level security;

create table public.team_recruit_interest (
  post_id uuid not null references public.team_recruit_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (post_id, user_id)
);
create index team_recruit_interest_user_idx on public.team_recruit_interest (user_id);
alter table public.team_recruit_interest enable row level security;

-- Anyone sees active posts; captains and admins also see their team's old ones.
create policy team_recruit_posts_read on public.team_recruit_posts for select
  using (active or public.is_captain_of(team_id) or public.is_admin());
-- Interest: the player, that team's captains, admins.
create policy team_recruit_interest_read on public.team_recruit_interest for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
    or exists (select 1 from public.team_recruit_posts p where p.id = post_id and public.is_captain_of(p.team_id))
  );
grant select on public.team_recruit_posts to anon, authenticated;
grant select on public.team_recruit_interest to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Why the team can't (still) advertise this kind of spot, or null.
create function public.recruit_block_reason(p_team_id uuid, p_looking_for text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_season public.seasons;
  v_spots record;
begin
  select * into v_team from public.teams where id = p_team_id;
  if v_team.id is null or v_team.status = 'removed' then
    return 'This team has been removed from the league.';
  end if;
  select * into v_season from public.seasons where id = v_team.season_id;
  if v_season.status not in ('signups', 'regular', 'playoffs') then
    return 'This season isn''t taking roster changes.';
  end if;
  if v_season.roster_lock_at is not null and now() >= v_season.roster_lock_at then
    return 'Rosters are locked for this season.';
  end if;
  select * into v_spots from public.team_open_spots(p_team_id);
  if coalesce(v_spots.open, 0) <= 0 then
    return 'Your roster is full.';
  end if;
  if p_looking_for = 'starter' and v_spots.starters_open <= 0 then
    return 'Your starter spots are full. Look for a sub instead.';
  end if;
  if p_looking_for = 'sub' and v_spots.subs_open <= 0 then
    return 'Your sub spots are full. Look for a starter instead.';
  end if;
  return null;
end;
$$;
revoke execute on function public.recruit_block_reason(uuid, text) from public, anon;
grant execute on function public.recruit_block_reason(uuid, text) to authenticated, service_role;

-- Takes a team's active post down (if any) and tells Discord.
create function public.recruit_close(p_team_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.team_recruit_posts
     set active = false, closed_reason = p_reason, updated_at = now()
   where team_id = p_team_id and active
  returning id into v_id;
  if v_id is not null then
    perform public.enqueue_notification('recruit_changed', jsonb_build_object('post_id', v_id));
  end if;
end;
$$;
revoke execute on function public.recruit_close(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Site: save and remove (captain or co-captain; admins can remove)
-- ---------------------------------------------------------------------------
create function public.recruit_save(
  p_team_id uuid,
  p_looking_for text,
  p_role text,
  p_availability text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_team public.teams;
  v_reason text;
  v_role text := nullif(btrim(coalesce(p_role, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.is_captain_of_for(v_uid, p_team_id) then
    raise exception 'Only the captain or co-captain can post for the team' using errcode = '42501';
  end if;
  if p_looking_for not in ('starter', 'sub', 'any') then
    raise exception 'Pick starter, sub or either' using errcode = 'P0001';
  end if;
  if v_role is not null and v_role not in ('AR', 'SMG', 'Flex') then
    raise exception 'Role must be AR, SMG or Flex (or any)' using errcode = 'P0001';
  end if;
  v_reason := public.recruit_block_reason(p_team_id, p_looking_for);
  if v_reason is not null then
    raise exception '%', v_reason using errcode = 'P0001';
  end if;
  select * into v_team from public.teams where id = p_team_id;

  update public.team_recruit_posts
     set looking_for = p_looking_for, preferred_role = v_role,
         availability = left(nullif(btrim(p_availability), ''), 280),
         note = left(nullif(btrim(p_note), ''), 1000),
         updated_at = now()
   where team_id = p_team_id and active
  returning id into v_id;
  if v_id is null then
    insert into public.team_recruit_posts (team_id, season_id, created_by, looking_for, preferred_role, availability, note)
    values (p_team_id, v_team.season_id, v_uid, p_looking_for, v_role,
            left(nullif(btrim(p_availability), ''), 280), left(nullif(btrim(p_note), ''), 1000))
    returning id into v_id;
  end if;
  perform public.enqueue_notification('recruit_changed', jsonb_build_object('post_id', v_id));
  return v_id;
end;
$$;
revoke execute on function public.recruit_save(uuid, text, text, text, text) from public, anon;
grant execute on function public.recruit_save(uuid, text, text, text, text) to authenticated;

create function public.recruit_remove(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_post public.team_recruit_posts;
begin
  select * into v_post from public.team_recruit_posts where id = p_post_id;
  if v_post.id is null then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if not (public.is_captain_of_for(v_uid, v_post.team_id) or public.is_admin_for(v_uid)) then
    raise exception 'Only the team''s captains or an admin can take this down' using errcode = '42501';
  end if;
  if not v_post.active then
    return;
  end if;
  perform public.recruit_close(v_post.team_id, case when public.is_captain_of_for(v_uid, v_post.team_id) then 'removed' else 'admin' end);
end;
$$;
revoke execute on function public.recruit_remove(uuid) from public, anon;
grant execute on function public.recruit_remove(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- "I'm interested": the bot (service role) and the site share one core
-- ---------------------------------------------------------------------------
-- Returns 'added' or 'already'.
create function public.recruit_interest_as(p_actor uuid, p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.team_recruit_posts;
  p public.profiles;
begin
  select * into v_post from public.team_recruit_posts where id = p_post_id;
  if v_post.id is null or not v_post.active then
    raise exception 'This team isn''t recruiting any more.' using errcode = 'P0001';
  end if;
  select * into p from public.profiles where id = p_actor;
  if p.id is null then
    raise exception 'Link your account on the site first.' using errcode = 'P0001';
  end if;
  if not p.is_player then
    raise exception 'Staff-only accounts can''t join teams.' using errcode = 'P0001';
  end if;
  if p.banned_until > now() then
    raise exception 'You are banned from league play.' using errcode = 'P0001';
  end if;
  if not public.is_profile_complete(p_actor) then
    raise exception 'Finish your profile (Activision ID, platform, rank and age) first.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.team_members tm
     where tm.user_id = p_actor and tm.season_id = v_post.season_id and tm.left_at is null and not tm.is_emergency
  ) then
    raise exception 'You''re already on a team this season.' using errcode = 'P0001';
  end if;

  insert into public.team_recruit_interest (post_id, user_id) values (p_post_id, p_actor)
  on conflict do nothing;
  if not found then
    return 'already';
  end if;
  perform public.enqueue_notification('recruit_interest', jsonb_build_object('post_id', p_post_id, 'user_id', p_actor));
  return 'added';
end;
$$;
revoke execute on function public.recruit_interest_as(uuid, uuid) from public, anon, authenticated;
grant execute on function public.recruit_interest_as(uuid, uuid) to service_role;

create function public.recruit_interest(p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return public.recruit_interest_as((select auth.uid()), p_post_id);
end;
$$;
revoke execute on function public.recruit_interest(uuid) from public, anon;
grant execute on function public.recruit_interest(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Posts come down by themselves
-- ---------------------------------------------------------------------------
-- Roster changed: close the post once the spot it advertises is full.
create function public.team_recruit_roster_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := coalesce(new.team_id, old.team_id);
  v_post public.team_recruit_posts;
begin
  select * into v_post from public.team_recruit_posts where team_id = v_team and active;
  if v_post.id is not null and public.recruit_block_reason(v_team, v_post.looking_for) is not null then
    perform public.recruit_close(v_team, 'filled');
  end if;
  return null;
end;
$$;
revoke execute on function public.team_recruit_roster_check() from public, anon, authenticated;
create trigger team_recruit_roster_check after insert or update of left_at, role, is_emergency on public.team_members
  for each row execute function public.team_recruit_roster_check();

-- Team removed.
create function public.team_recruit_team_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'removed' and old.status <> 'removed' then
    perform public.recruit_close(new.id, 'team_removed');
  end if;
  return null;
end;
$$;
revoke execute on function public.team_recruit_team_check() from public, anon, authenticated;
create trigger team_recruit_team_check after update of status on public.teams
  for each row execute function public.team_recruit_team_check();

-- Post row deleted (the team was deleted): delete its Discord card.
create function public.team_recruit_posts_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.discord_message_id is not null then
    perform public.enqueue_notification('recruit_deleted', jsonb_build_object(
      'channel_id', old.discord_channel_id, 'message_id', old.discord_message_id));
  end if;
  return null;
end;
$$;
revoke execute on function public.team_recruit_posts_deleted() from public, anon, authenticated;
create trigger team_recruit_posts_deleted after delete on public.team_recruit_posts
  for each row execute function public.team_recruit_posts_deleted();

-- Rosters locked or the season moved on: the scheduler calls this every run.
create function public.recruit_close_stale()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select p.team_id from public.team_recruit_posts p
      join public.seasons s on s.id = p.season_id
     where p.active
       and (s.status not in ('signups', 'regular', 'playoffs')
            or (s.roster_lock_at is not null and now() >= s.roster_lock_at))
  loop
    perform public.recruit_close(r.team_id, 'roster_lock');
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.recruit_close_stale() from public, anon, authenticated;
grant execute on function public.recruit_close_stale() to service_role;
