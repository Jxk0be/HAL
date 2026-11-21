-- Team invites notify the player in Discord: a DM with Accept / Decline when the invite is sent
-- (from the site or the #lfg button), updated when it closes, plus a note in the team's channel
-- when the player answers. The bot answers through respond_to_invite_as, which runs the same
-- respond_to_invite as the player (so every roster rule applies exactly as on the site).

create function public.team_invites_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.enqueue_notification('team_invite_sent', jsonb_build_object('invite_id', new.id));
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    perform public.enqueue_notification('team_invite_closed', jsonb_build_object('invite_id', new.id, 'status', new.status));
  end if;
  return new;
end;
$$;
revoke execute on function public.team_invites_notify() from public, anon, authenticated;
create trigger team_invites_notify after insert or update of status on public.team_invites
  for each row execute function public.team_invites_notify();

-- The bot's Accept / Decline buttons. Runs respond_to_invite with the player as the signed-in user
-- for the rest of this transaction, so the roster guards treat it exactly like the site.
create function public.respond_to_invite_as(p_actor uuid, p_invite_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := current_setting('request.jwt.claims', true);
  v_status public.invite_status;
begin
  if not exists (select 1 from public.team_invites where id = p_invite_id and user_id = p_actor) then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  perform public.respond_to_invite(p_invite_id, p_accept);
  perform set_config('request.jwt.claims', coalesce(v_prev, ''), true);
  select status into v_status from public.team_invites where id = p_invite_id;
  return v_status::text;
end;
$$;
revoke execute on function public.respond_to_invite_as(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.respond_to_invite_as(uuid, uuid, boolean) to service_role;
