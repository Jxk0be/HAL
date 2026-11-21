-- Step 19: /lfg free agent posts from Discord.
--
-- The bot (service role) acts for a HAL user through *_as functions that apply the same rules as
-- the site. Posts live in free_agent_posts (the site's table) with the Discord message ids, and
-- any change made on the site (edit, deactivate, delete, joining a team) queues lfg_changed /
-- lfg_deleted in the outbox so the scheduler edits or deletes the Discord message.

alter table public.free_agent_posts add column discord_channel_id text;

-- ---------------------------------------------------------------------------
-- Invites: one core used by the site (invite_player) and the bot (invite_player_as)
-- ---------------------------------------------------------------------------
create function public.invite_player_as(
  p_actor uuid,
  p_team_id uuid,
  p_user_id uuid,
  p_role public.member_role default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_season public.seasons;
  v_spots record;
  v_id uuid;
begin
  select * into v_team from public.teams where id = p_team_id;
  if v_team.id is null then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  if not public.is_captain_of_for(p_actor, p_team_id) then
    raise exception 'Only the captain or co-captain can invite players' using errcode = '42501';
  end if;
  if v_team.status = 'removed' then
    raise exception 'This team has been removed from the league' using errcode = 'P0001';
  end if;
  select * into v_season from public.seasons where id = v_team.season_id;
  if v_season.status = 'complete' then
    raise exception 'This season is over' using errcode = 'P0001';
  end if;
  if v_season.roster_lock_at is not null and now() >= v_season.roster_lock_at then
    raise exception 'Rosters are locked for this season' using errcode = 'P0001';
  end if;
  if p_user_id = p_actor then
    raise exception 'You cannot invite yourself' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id and banned_until > now()) then
    raise exception 'This player is banned' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.team_members tm
     where tm.season_id = v_team.season_id and tm.user_id = p_user_id
       and tm.left_at is null and not tm.is_emergency
  ) then
    raise exception 'This player is already on a team this season' using errcode = 'P0001';
  end if;

  select * into v_spots from public.team_open_spots(p_team_id);
  if v_spots.open <= 0 then
    raise exception 'Your roster is full (max % players)', v_season.max_roster using errcode = 'P0001';
  end if;
  if p_role = 'starter' and v_spots.starters_open <= 0 then
    raise exception 'Starter spots are full (max %)', v_season.max_starters using errcode = 'P0001';
  end if;
  if p_role = 'sub' and v_spots.subs_open <= 0 then
    raise exception 'Sub spots are full (max %)', v_season.max_subs using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.team_invites
     where team_id = p_team_id and user_id = p_user_id and status = 'pending' and expires_at > now()
  ) then
    raise exception 'This player already has a pending invite from your team' using errcode = 'P0001';
  end if;
  update public.team_invites set status = 'expired'
   where team_id = p_team_id and user_id = p_user_id and status = 'pending';

  insert into public.team_invites (team_id, user_id, invited_by, role)
  values (p_team_id, p_user_id, p_actor, p_role)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.invite_player_as(uuid, uuid, uuid, public.member_role) from public, anon, authenticated;
grant execute on function public.invite_player_as(uuid, uuid, uuid, public.member_role) to service_role;

create or replace function public.invite_player(
  p_team_id uuid,
  p_user_id uuid,
  p_role public.member_role default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to invite players' using errcode = '42501';
  end if;
  return public.invite_player_as((select auth.uid()), p_team_id, p_user_id, p_role);
end;
$$;

-- The captain's (or co-captain's) team in the active season, for the bot.
create function public.captain_team_for(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.teams t
    join public.seasons s on s.id = t.season_id
   where p_user_id in (t.captain_id, t.co_captain_id)
     and t.status <> 'removed'
     and s.status in ('signups', 'regular', 'playoffs')
   limit 1;
$$;
revoke execute on function public.captain_team_for(uuid) from public, anon, authenticated;
grant execute on function public.captain_team_for(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- /lfg post and remove
-- ---------------------------------------------------------------------------
-- Creates or edits the user's free agent post. A new post is allowed once per 24 hours; editing
-- the current one is always allowed. Returns the post and any existing Discord message ids.
create function public.lfg_upsert_as(p_user_id uuid, p_role text, p_availability text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  v_post public.free_agent_posts;
  v_last timestamptz;
  v_role text := nullif(btrim(coalesce(p_role, '')), '');
  v_season uuid;
  v_prev text := coalesce(current_setting('hal.internal', true), '');
begin
  select * into p from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if p.banned_until > now() then
    raise exception 'You are banned from league play' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.team_members tm where tm.user_id = p_user_id and tm.left_at is null and not tm.is_emergency) then
    raise exception 'You are on a team. Leave it to post as a free agent.' using errcode = 'P0001';
  end if;
  if not public.is_profile_complete(p_user_id) then
    raise exception 'Finish your profile (Activision ID, platform and age) before posting.' using errcode = 'P0001';
  end if;
  -- Role: AR, SMG or Flex in any case.
  if v_role is not null then
    v_role := case lower(v_role) when 'ar' then 'AR' when 'smg' then 'SMG' when 'flex' then 'Flex' else null end;
    if v_role is null then
      raise exception 'Role must be AR, SMG or Flex (or leave it blank)' using errcode = 'P0001';
    end if;
  end if;

  select * into v_post from public.free_agent_posts where user_id = p_user_id and active;
  if v_post.id is null then
    select max(created_at) into v_last from public.free_agent_posts where user_id = p_user_id;
    if v_last > now() - interval '24 hours' then
      raise exception 'You can post again %. Use /lfg post to edit your current post instead.',
        '<t:' || floor(extract(epoch from v_last + interval '24 hours'))::bigint || ':R>' using errcode = 'P0001';
    end if;
  end if;

  select id into v_season from public.seasons where status in ('signups', 'regular', 'playoffs') limit 1;
  perform set_config('hal.internal', 'on', true);
  if v_post.id is null then
    insert into public.free_agent_posts (user_id, season_id, platform, preferred_role, availability, note, active)
    values (p_user_id, v_season, p.platform, v_role, left(nullif(btrim(p_availability), ''), 280), left(nullif(btrim(p_note), ''), 1000), true)
    returning * into v_post;
  else
    update public.free_agent_posts
       set platform = p.platform, preferred_role = v_role,
           availability = left(nullif(btrim(p_availability), ''), 280), note = left(nullif(btrim(p_note), ''), 1000)
     where id = v_post.id
    returning * into v_post;
  end if;
  update public.profiles set is_free_agent = true where id = p_user_id and not is_free_agent;
  perform set_config('hal.internal', v_prev, true);

  return jsonb_build_object(
    'post_id', v_post.id,
    'platform', v_post.platform,
    'role', v_post.preferred_role,
    'availability', v_post.availability,
    'note', v_post.note,
    'activision_id', p.activision_id,
    'discord_username', p.discord_username,
    'channel_id', v_post.discord_channel_id,
    'message_id', v_post.discord_message_id
  );
end;
$$;
revoke execute on function public.lfg_upsert_as(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.lfg_upsert_as(uuid, text, text, text) to service_role;

-- Records where the bot posted it.
create function public.lfg_set_message(p_post_id uuid, p_channel_id text, p_message_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.free_agent_posts set discord_channel_id = p_channel_id, discord_message_id = p_message_id where id = p_post_id;
$$;
revoke execute on function public.lfg_set_message(uuid, text, text) from public, anon, authenticated;
grant execute on function public.lfg_set_message(uuid, text, text) to service_role;

-- Deactivates the user's post; returns the Discord message to delete (or nulls).
create function public.lfg_remove_as(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.free_agent_posts;
  v_prev text := coalesce(current_setting('hal.internal', true), '');
begin
  select * into v_post from public.free_agent_posts where user_id = p_user_id and active;
  if v_post.id is null then
    return jsonb_build_object('removed', false);
  end if;
  perform set_config('hal.internal', 'on', true);
  update public.free_agent_posts set active = false, discord_channel_id = null, discord_message_id = null where id = v_post.id;
  perform set_config('hal.internal', v_prev, true);
  return jsonb_build_object('removed', true, 'channel_id', v_post.discord_channel_id, 'message_id', v_post.discord_message_id);
end;
$$;
revoke execute on function public.lfg_remove_as(uuid) from public, anon, authenticated;
grant execute on function public.lfg_remove_as(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Site changes reach Discord through the outbox
-- ---------------------------------------------------------------------------
create function public.free_agent_posts_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.discord_message_id is not null then
      perform public.enqueue_notification('lfg_deleted', jsonb_build_object(
        'channel_id', old.discord_channel_id, 'message_id', old.discord_message_id));
    end if;
    return old;
  end if;
  -- Only content changes on a post that is in Discord (the bot's own id updates don't count).
  if old.discord_message_id is not null
     and (new.active, new.preferred_role, new.availability, new.note, new.platform)
         is distinct from (old.active, old.preferred_role, old.availability, old.note, old.platform) then
    perform public.enqueue_notification('lfg_changed', jsonb_build_object(
      'post_id', new.id, 'channel_id', old.discord_channel_id, 'message_id', old.discord_message_id));
  end if;
  return new;
end;
$$;
revoke execute on function public.free_agent_posts_notify() from public, anon, authenticated;

create trigger free_agent_posts_notify after update or delete on public.free_agent_posts
  for each row execute function public.free_agent_posts_notify();
