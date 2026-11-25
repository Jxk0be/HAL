-- Free agent posts made on the site never showed up:
--  1. free_agent_posts_guard skipped everything for admins, including marking the poster as a free
--     agent, so an admin's post was saved but free_agent_board (which needs is_free_agent) hid it.
--  2. free_agent_posts_notify only queued Discord work for posts already in Discord (made with
--     /lfg), so a post made on the site was never sent to #free-agents.

create or replace function public.free_agent_posts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_internal() then
    return new;
  end if;
  if new.active and (tg_op = 'INSERT' or not old.active) then
    -- Staff-only accounts can't be free agents, admins included.
    if not exists (select 1 from public.profiles p where p.id = new.user_id and p.is_player) then
      raise exception 'Staff-only accounts can''t post as a free agent.' using errcode = 'P0001';
    end if;
    if not public.is_admin() then
      if exists (
        select 1 from public.team_members tm
         where tm.user_id = new.user_id and tm.left_at is null and not tm.is_emergency
      ) then
        raise exception 'You are on a team. Leave it to post as a free agent.' using errcode = 'P0001';
      end if;
      if not public.is_profile_complete(new.user_id) then
        raise exception 'Finish your profile before posting as a free agent.' using errcode = 'P0001';
      end if;
    end if;
    update public.profiles set is_free_agent = true where id = new.user_id and not is_free_agent;
  end if;
  return new;
end;
$$;

create or replace function public.free_agent_posts_notify()
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
  -- /lfg (the bot, an internal caller) posts its own message; only site changes are queued here.
  if public.is_internal() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.active then
      perform public.enqueue_notification('lfg_changed', jsonb_build_object(
        'post_id', new.id, 'channel_id', null, 'message_id', null));
    end if;
    return new;
  end if;
  -- Content changes only (the bot's own id updates don't count). A post with no message yet is
  -- sent once it's active; one already in Discord is edited, or deleted once inactive.
  if (new.active, new.preferred_role, new.availability, new.note, new.platform)
     is distinct from (old.active, old.preferred_role, old.availability, old.note, old.platform)
     and (old.discord_message_id is not null or new.active) then
    perform public.enqueue_notification('lfg_changed', jsonb_build_object(
      'post_id', new.id, 'channel_id', old.discord_channel_id, 'message_id', old.discord_message_id));
  end if;
  return new;
end;
$$;

drop trigger if exists free_agent_posts_notify on public.free_agent_posts;
create trigger free_agent_posts_notify after insert or update or delete on public.free_agent_posts
  for each row execute function public.free_agent_posts_notify();

revoke execute on function public.free_agent_posts_guard() from public, anon, authenticated;
revoke execute on function public.free_agent_posts_notify() from public, anon, authenticated;

-- Backfill: posts already saved on the site.
update public.profiles p set is_free_agent = true
 where p.is_player and not p.is_free_agent
   and exists (select 1 from public.free_agent_posts fa where fa.user_id = p.id and fa.active);

select public.enqueue_notification('lfg_changed', jsonb_build_object(
         'post_id', fa.id, 'channel_id', null, 'message_id', null))
  from public.free_agent_posts fa
  join public.profiles p on p.id = fa.user_id
 where fa.active and fa.discord_message_id is null and p.is_player;
