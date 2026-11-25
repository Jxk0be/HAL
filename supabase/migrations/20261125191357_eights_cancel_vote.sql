-- 8s "Request cancel": while a match is voting or live, any of its 8 players can request a cancel
-- (pressing again withdraws it). At 5 requests the match is cancelled: it counts for nothing, as if
-- it never happened, and its players are free to queue again. resolved_by stays null, which tells
-- a vote cancel apart from an admin cancel.

create table public.eights_cancel_requests (
  match_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id),
  foreign key (match_id, user_id) references public.eights_players (match_id, user_id) on delete cascade
);
alter table public.eights_cancel_requests enable row level security;
revoke all on public.eights_cancel_requests from anon, authenticated;

-- Returns { status: 'requested' | 'withdrawn' | 'cancelled', count, needed }.
create function public.eights_request_cancel(p_user_id uuid, p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_needed constant integer := 5;
  v_status text;
  v_count integer;
begin
  select status into v_status from public.eights_matches where id = p_match_id for update;
  if v_status is null then
    raise exception 'That 8s match doesn''t exist.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.eights_players where match_id = p_match_id and user_id = p_user_id) then
    raise exception 'Only the 8 players in this match can request a cancel.' using errcode = 'P0001';
  end if;
  if v_status not in ('voting', 'live') then
    raise exception 'This match is already settled, so it can''t be cancelled.' using errcode = 'P0001';
  end if;

  delete from public.eights_cancel_requests where match_id = p_match_id and user_id = p_user_id;
  if found then
    select count(*) into v_count from public.eights_cancel_requests where match_id = p_match_id;
    return jsonb_build_object('status', 'withdrawn', 'count', v_count, 'needed', v_needed);
  end if;

  insert into public.eights_cancel_requests (match_id, user_id) values (p_match_id, p_user_id);
  select count(*) into v_count from public.eights_cancel_requests where match_id = p_match_id;
  if v_count >= v_needed then
    update public.eights_matches
       set status = 'cancelled', winner = null, resolved_at = now(), resolved_by = null
     where id = p_match_id;
    return jsonb_build_object('status', 'cancelled', 'count', v_count, 'needed', v_needed);
  end if;
  return jsonb_build_object('status', 'requested', 'count', v_count, 'needed', v_needed);
end;
$$;

revoke execute on function public.eights_request_cancel(uuid, uuid) from public, anon, authenticated;
grant execute on function public.eights_request_cancel(uuid, uuid) to service_role;
