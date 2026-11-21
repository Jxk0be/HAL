-- Admin alerts: everything that waits on an admin posts in #admin-only and pings HAL Admin.
-- Two events had no notification yet; the bot handles the rest (disputes, missing check-ins,
-- emergency subs, matches still unreported 24h after the start).

-- A new team needs approval (rule 3.5).
create function public.teams_pending_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    perform public.enqueue_notification('team_pending', jsonb_build_object('team_id', new.id));
  end if;
  return new;
end;
$$;
revoke execute on function public.teams_pending_notify() from public, anon, authenticated;
create trigger teams_pending_notify after insert or update of status on public.teams
  for each row execute function public.teams_pending_notify();

-- Reports disagree: one alert per match per batch of new mismatches (rule 9.3).
create function public.stat_mismatches_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications_outbox (type, payload)
  select 'mismatch_opened', jsonb_build_object('match_id', mm.match_id, 'fields', count(*))
    from new_rows n
    join public.match_maps mm on mm.id = n.match_map_id
   group by mm.match_id;
  return null;
end;
$$;
revoke execute on function public.stat_mismatches_notify() from public, anon, authenticated;
create trigger stat_mismatches_notify after insert on public.stat_mismatches
  referencing new table as new_rows
  for each statement execute function public.stat_mismatches_notify();
