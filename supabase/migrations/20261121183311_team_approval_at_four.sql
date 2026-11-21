-- Team approval needs a playable roster (rule 3.5, as changed by the owner):
--   - A new team is still created as pending and can recruit straight away.
--   - Admins are alerted (team_pending) when a pending team reaches 4 players, not on creation.
--   - A team can't be approved with fewer than 4 players. Admins can still remove it at any size.

-- Alert when the status becomes pending again with a full enough roster (rare: e.g. set back by
-- an admin). Creation no longer alerts.
create or replace function public.teams_pending_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status = 'pending' and old.status is distinct from 'pending'
     and (select count(*) from public.team_members tm
           where tm.team_id = new.id and tm.left_at is null and not tm.is_emergency) >= 4 then
    perform public.enqueue_notification('team_pending', jsonb_build_object('team_id', new.id));
  end if;
  return new;
end;
$$;

-- A pending team reaching 4 players is ready for review.
create function public.team_members_ready_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_emergency or new.left_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.left_at is null then
    return new; -- not a new active member (e.g. a role switch)
  end if;
  if exists (select 1 from public.teams t where t.id = new.team_id and t.status = 'pending')
     and (select count(*) from public.team_members tm
           where tm.team_id = new.team_id and tm.left_at is null and not tm.is_emergency) = 4 then
    perform public.enqueue_notification('team_pending', jsonb_build_object('team_id', new.team_id));
  end if;
  return new;
end;
$$;
revoke execute on function public.team_members_ready_notify() from public, anon, authenticated;
create trigger team_members_ready_notify after insert or update of left_at on public.team_members
  for each row execute function public.team_members_ready_notify();

-- No approval below 4 players.
create function public.teams_approval_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and not public.is_internal()
     and (select count(*) from public.team_members tm
           where tm.team_id = new.id and tm.left_at is null and not tm.is_emergency) < 4 then
    raise exception 'A team needs at least 4 players before it can be approved (rule 3.5)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.teams_approval_guard() from public, anon, authenticated;
create trigger teams_approval_guard before update of status on public.teams
  for each row execute function public.teams_approval_guard();
