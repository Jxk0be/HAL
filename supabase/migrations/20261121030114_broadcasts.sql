-- Step 17: caster broadcasts. HAL has no stream of its own; casters stream on their own channel and
-- paste the link. Casters can only touch the broadcast columns, through these functions.

-- Stream links: https on Twitch, YouTube or Kick only.
create function public.is_stream_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_url ~* '^https://([a-z0-9-]+\.)*(twitch\.tv|youtube\.com|youtu\.be|kick\.com)(/|$)', false)
     and length(p_url) <= 300;
$$;

alter table public.matches add column broadcast_started_at timestamptz;

create or replace function public.set_broadcast(p_match_id uuid, p_live boolean, p_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  if not (public.is_caster() or public.is_admin()) then
    raise exception 'Only casters and admins can set a broadcast' using errcode = '42501';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if public.is_party_to_match(p_match_id) then
    raise exception 'You cannot take staff actions on your own team''s match' using errcode = '42501';
  end if;
  if p_live and not public.is_stream_url(btrim(coalesce(p_url, ''))) then
    raise exception 'Use an https:// link to Twitch, YouTube or Kick' using errcode = 'P0001';
  end if;
  if p_live and m.status in ('cancelled', 'forfeit') then
    raise exception 'This match isn''t being played' using errcode = 'P0001';
  end if;
  if m.broadcast_by is not null and m.broadcast_by <> (select auth.uid()) and not public.is_admin() then
    raise exception 'Another caster has this match' using errcode = 'P0001';
  end if;

  update public.matches
     set broadcast_live = p_live,
         -- Ending keeps the link as the VOD / stream link.
         broadcast_url = case when p_live then btrim(p_url) else broadcast_url end,
         broadcast_by = case when p_live or broadcast_by is null then (select auth.uid()) else broadcast_by end,
         broadcast_started_at = case when p_live and not m.broadcast_live then now() else broadcast_started_at end
   where id = p_match_id;

  if p_live and not m.broadcast_live then
    perform public.enqueue_notification('broadcast_live', jsonb_build_object(
      'match_id', p_match_id, 'url', btrim(p_url), 'caster_id', (select auth.uid())));
  elsif not p_live and m.broadcast_live then
    perform public.enqueue_notification('broadcast_ended', jsonb_build_object('match_id', p_match_id));
  end if;
end;
$$;
revoke execute on function public.set_broadcast(uuid, boolean, text) from public, anon;
grant execute on function public.set_broadcast(uuid, boolean, text) to authenticated;

-- Claim (or release) an upcoming match so other casters know it's covered.
create function public.claim_broadcast(p_match_id uuid, p_claim boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
begin
  if not (public.is_caster() or public.is_admin()) then
    raise exception 'Only casters and admins can claim a broadcast' using errcode = '42501';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if public.is_party_to_match(p_match_id) then
    raise exception 'You cannot cast your own team''s match' using errcode = '42501';
  end if;
  if m.broadcast_live then
    raise exception 'This match is live; end the broadcast first' using errcode = 'P0001';
  end if;
  if p_claim then
    if m.broadcast_by is not null and m.broadcast_by <> (select auth.uid()) then
      raise exception 'Another caster already has this match' using errcode = 'P0001';
    end if;
    if m.status in ('confirmed', 'forfeit', 'cancelled') then
      raise exception 'This match is already over' using errcode = 'P0001';
    end if;
    update public.matches set broadcast_by = (select auth.uid()) where id = p_match_id;
  else
    if m.broadcast_by is distinct from (select auth.uid()) and not public.is_admin() then
      raise exception 'Only the caster who claimed it (or an admin) can release it' using errcode = '42501';
    end if;
    update public.matches set broadcast_by = null, broadcast_url = null where id = p_match_id;
  end if;
end;
$$;
revoke execute on function public.claim_broadcast(uuid, boolean) from public, anon;
grant execute on function public.claim_broadcast(uuid, boolean) to authenticated;

-- Public list of live broadcasts with the caster's name (staff names are public, as in the audit log).
create function public.live_broadcasts()
returns table (
  match_id uuid,
  home_tag text,
  away_tag text,
  home_name text,
  away_name text,
  url text,
  caster text,
  started_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, ht.tag, at.tag, ht.name, at.name, m.broadcast_url,
         coalesce(p.discord_username, p.activision_id, 'HAL caster'), m.broadcast_started_at
    from public.matches m
    join public.teams ht on ht.id = m.home_team_id
    join public.teams at on at.id = m.away_team_id
    left join public.profiles p on p.id = m.broadcast_by
   where m.broadcast_live
   order by m.broadcast_started_at nulls last, m.scheduled_at;
$$;
grant execute on function public.live_broadcasts() to anon, authenticated;

-- Caster names for claimed / past broadcasts on given matches (public).
create function public.broadcast_casters(p_match_ids uuid[])
returns table (match_id uuid, caster text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, coalesce(p.discord_username, p.activision_id, 'HAL caster')
    from public.matches m
    join public.profiles p on p.id = m.broadcast_by
   where m.id = any (p_match_ids) and cardinality(p_match_ids) <= 500;
$$;
grant execute on function public.broadcast_casters(uuid[]) to anon, authenticated;
