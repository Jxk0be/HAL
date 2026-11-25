-- 8s only needs a linked account with an Activision ID (staff-only accounts too, no 18+/controller
-- confirmations). Banned accounts are still turned away.
create or replace function public.eights_join(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_match uuid;
  v_map text;
  v_mode text;
begin
  -- One queue: serialise joins so two people can't both start a match with the same players.
  perform pg_advisory_xact_lock(hashtext('eights_queue'));

  -- 8s is casual: any account with an Activision ID can play, staff-only included.
  if exists (
    select 1 from public.profiles p
     where p.id = p_user_id and p.banned_until is not null and p.banned_until > now()
  ) then
    raise exception 'You''re banned, so you can''t join 8s right now.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = p_user_id and p.activision_id is not null
  ) then
    raise exception 'Add your Activision ID on the site first (My profile).' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.eights_players ep join public.eights_matches m on m.id = ep.match_id
     where ep.user_id = p_user_id and m.status = 'live'
  ) then
    raise exception 'You''re in an 8s match that hasn''t been reported yet. Report it first.' using errcode = 'P0001';
  end if;

  -- People who queued and walked away drop off after 2 hours.
  delete from public.eights_queue where joined_at < now() - interval '2 hours';

  insert into public.eights_queue (user_id) values (p_user_id) on conflict (user_id) do nothing;
  if not found then
    return jsonb_build_object('status', 'already', 'count', (select count(*) from public.eights_queue));
  end if;

  select count(*) into v_count from public.eights_queue;
  if v_count < 8 then
    return jsonb_build_object('status', 'queued', 'count', v_count);
  end if;

  select mp.name, gm.name into v_map, v_mode
    from public.map_modes mm
    join public.maps mp on mp.id = mm.map_id and mp.active
    join public.game_modes gm on gm.id = mm.mode_id and gm.active
   order by random()
   limit 1;

  insert into public.eights_matches (map_name, mode_name) values (v_map, v_mode) returning id into v_match;

  with picked as (
    select user_id from public.eights_queue order by joined_at, user_id limit 8
  ), shuffled as (
    select user_id, row_number() over (order by random()) as n from picked
  )
  insert into public.eights_players (match_id, user_id, team)
  select v_match, user_id, case when n <= 4 then 'a' else 'b' end from shuffled;

  delete from public.eights_queue q using public.eights_players ep
   where ep.match_id = v_match and ep.user_id = q.user_id;

  return jsonb_build_object('status', 'started', 'count', (select count(*) from public.eights_queue), 'match_id', v_match);
end;
$$;

revoke execute on function public.eights_join(uuid) from public, anon, authenticated;
grant execute on function public.eights_join(uuid) to service_role;
