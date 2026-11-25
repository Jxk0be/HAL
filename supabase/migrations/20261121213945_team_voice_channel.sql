-- Each approved team also gets a private voice channel next to its text channel.
-- Only the sync function (service role) sets the id, like discord_channel_id.

alter table public.teams add column discord_voice_channel_id text;

create or replace function public.teams_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
begin
  if public.is_internal() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if public.is_admin() then
      return new;
    end if;
    select * into v_season from public.seasons where id = new.season_id;
    if v_season.status not in ('signups', 'regular') then
      raise exception 'Team registration is closed for this season' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.profiles p where p.id = new.captain_id and p.banned_until > now()) then
      raise exception 'Banned players cannot create teams' using errcode = 'P0001';
    end if;
    new.status := 'pending';
    new.division_id := null;
    new.roster_changes_used := 0;
    new.forfeit_count := 0;
    new.discord_role_id := null;
    new.discord_channel_id := null;
    new.discord_voice_channel_id := null;
    return new;
  end if;

  -- UPDATE
  if new.co_captain_id is not null and new.co_captain_id is distinct from old.co_captain_id
     and not exists (
       select 1 from public.team_members tm
        where tm.team_id = new.id and tm.user_id = new.co_captain_id
          and tm.left_at is null and not tm.is_emergency
     ) then
    raise exception 'The co-captain must be on the roster' using errcode = 'P0001';
  end if;

  if public.can_staff_team(old.id) then
    return new;
  end if;

  -- Captains may edit presentation fields only.
  if new.season_id is distinct from old.season_id
     or new.division_id is distinct from old.division_id
     or new.status is distinct from old.status
     or new.captain_id is distinct from old.captain_id
     or new.roster_changes_used is distinct from old.roster_changes_used
     or new.forfeit_count is distinct from old.forfeit_count
     or new.discord_role_id is distinct from old.discord_role_id
     or new.discord_channel_id is distinct from old.discord_channel_id
     or new.discord_voice_channel_id is distinct from old.discord_voice_channel_id then
    raise exception 'Captains can only change the team name, tag, logo and co-captain' using errcode = '42501';
  end if;
  if old.status = 'removed' then
    raise exception 'This team has been removed from the league' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.discord_sync_teams_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.discord_sync_enqueue('team_removed', jsonb_build_object(
      'team_id', old.id, 'role_id', old.discord_role_id, 'channel_id', old.discord_channel_id,
      'voice_channel_id', old.discord_voice_channel_id));
    return old;
  end if;
  -- Ignore writes that only store Discord ids (the sync function's own updates).
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.name is not distinct from old.name
     and new.tag is not distinct from old.tag
     and new.captain_id is not distinct from old.captain_id
     and new.co_captain_id is not distinct from old.co_captain_id then
    return new;
  end if;
  perform public.discord_sync_enqueue('team_sync', jsonb_build_object('team_id', new.id));
  if tg_op = 'UPDATE' and new.captain_id is distinct from old.captain_id then
    perform public.discord_sync_enqueue('user_sync', jsonb_build_object('user_id', old.captain_id));
  end if;
  if tg_op = 'UPDATE' and old.co_captain_id is not null and new.co_captain_id is distinct from old.co_captain_id then
    perform public.discord_sync_enqueue('user_sync', jsonb_build_object('user_id', old.co_captain_id));
  end if;
  return new;
end;
$$;
