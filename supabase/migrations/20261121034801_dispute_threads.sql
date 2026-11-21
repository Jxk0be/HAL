-- Step 22: /dispute and private Discord threads for disputes.
--
-- open_dispute_as(actor, ...) is the single place disputes are opened (the site's open_dispute
-- wraps it). Every dispute gets a private thread in #disputes with both teams' captains and
-- co-captains and every admin who is NOT on either team (recusal); dispute_thread_people()
-- returns exactly those Discord ids. The thread id lives in disputes.discord_thread_id
-- (hidden from the API).

create table public.pending_discord_disputes (
  discord_user_id text not null,
  match_id uuid not null references public.matches (id) on delete cascade,
  attachment jsonb,
  created_at timestamptz not null default now(),
  primary key (discord_user_id, match_id)
);
create index pending_discord_disputes_match_idx on public.pending_discord_disputes (match_id);
alter table public.pending_discord_disputes enable row level security;
revoke all on public.pending_discord_disputes from anon, authenticated;
-- No policies: service role only.

create function public.open_dispute_as(
  p_actor uuid,
  p_match_id uuid,
  p_category public.dispute_category,
  p_description text,
  p_evidence jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  v_team uuid;
  v_id uuid;
  e jsonb;
  v_path text;
  v_url text;
  v_prev text := coalesce(current_setting('hal.internal', true), '');
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  select t.id into v_team from public.teams t
   where t.id in (m.home_team_id, m.away_team_id) and public.is_captain_of_for(p_actor, t.id)
   limit 1;
  if v_team is null then
    raise exception 'Only a captain or co-captain of either team can open a dispute' using errcode = '42501';
  end if;
  if m.status = 'cancelled' then
    raise exception 'This match was cancelled' using errcode = 'P0001';
  end if;
  if now() < m.scheduled_at then
    raise exception 'Disputes open once the match has started' using errcode = 'P0001';
  end if;
  if now() > greatest(m.scheduled_at, coalesce(m.confirmed_at, m.scheduled_at)) + interval '24 hours' then
    raise exception 'Disputes must be opened within 24 hours of the match (or of the result being confirmed)' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.disputes where match_id = p_match_id and status = 'open') then
    raise exception 'A dispute is already open on this match. Add a comment to it instead.' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_description, ''))) < 10 then
    raise exception 'Describe the problem (at least 10 characters)' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_evidence, '[]'::jsonb)) > 10 then
    raise exception 'Add at most 10 pieces of evidence' using errcode = 'P0001';
  end if;

  perform set_config('hal.internal', 'on', true);
  insert into public.disputes (match_id, team_id, opened_by, reason, category, match_status_before)
  values (p_match_id, v_team, p_actor, btrim(p_description), p_category, m.status)
  returning id into v_id;

  for e in select x from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) x loop
    v_path := nullif(btrim(e ->> 'path'), '');
    v_url := nullif(btrim(e ->> 'url'), '');
    if v_path is not null then
      if left(v_path, length(format('disputes/%s/%s/', p_match_id, v_team))) <> format('disputes/%s/%s/', p_match_id, v_team)
         or not exists (select 1 from storage.objects o where o.bucket_id = 'screenshots' and o.name = v_path) then
        raise exception 'An evidence image didn''t upload. Add it again.' using errcode = 'P0001';
      end if;
    elsif v_url is null or v_url !~ '^https://' then
      raise exception 'Evidence links must start with https://' using errcode = 'P0001';
    end if;
    insert into public.dispute_evidence (dispute_id, storage_path, url, note, added_by)
    values (v_id, v_path, v_url, left(nullif(btrim(e ->> 'note'), ''), 200), p_actor);
  end loop;
  perform set_config('hal.internal', v_prev, true);
  return v_id;
end;
$$;
revoke execute on function public.open_dispute_as(uuid, uuid, public.dispute_category, text, jsonb) from public, anon, authenticated;
grant execute on function public.open_dispute_as(uuid, uuid, public.dispute_category, text, jsonb) to service_role;

create or replace function public.open_dispute(
  p_match_id uuid,
  p_category public.dispute_category,
  p_description text,
  p_evidence jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to open a dispute' using errcode = '42501';
  end if;
  return public.open_dispute_as((select auth.uid()), p_match_id, p_category, p_description, p_evidence);
end;
$$;

-- Matches a captain can still dispute (for the bot's autocomplete).
create function public.disputable_matches_for(p_actor uuid)
returns table (match_id uuid, week smallint, scheduled_at timestamptz, team_id uuid, opponent_tag text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.week, m.scheduled_at, t.id, case when m.home_team_id = t.id then at.tag else ht.tag end
    from public.teams t
    join public.matches m on t.id in (m.home_team_id, m.away_team_id)
    join public.teams ht on ht.id = m.home_team_id
    join public.teams at on at.id = m.away_team_id
   where public.is_captain_of_for(p_actor, t.id)
     and m.status <> 'cancelled'
     and m.scheduled_at <= now()
     and now() <= greatest(m.scheduled_at, coalesce(m.confirmed_at, m.scheduled_at)) + interval '24 hours'
     and not exists (select 1 from public.disputes d where d.match_id = m.id and d.status = 'open')
   order by m.scheduled_at desc
   limit 25;
$$;
revoke execute on function public.disputable_matches_for(uuid) from public, anon, authenticated;
grant execute on function public.disputable_matches_for(uuid) to service_role;

-- Who belongs in a dispute's thread: both teams' captains and co-captains, and admins/owners who
-- are not on either team. recused = admins left out because they play for one of the teams.
create function public.dispute_thread_people(p_dispute_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with d as (
    select d.id, m.home_team_id, m.away_team_id
      from public.disputes d join public.matches m on m.id = d.match_id
     where d.id = p_dispute_id
  ),
  captains as (
    select distinct p.discord_id
      from d join public.teams t on t.id in (d.home_team_id, d.away_team_id)
      join public.profiles p on p.id in (t.captain_id, t.co_captain_id)
     where p.discord_id is not null
  ),
  admins as (
    select distinct p.id, p.discord_id,
           exists (
             select 1 from public.team_members tm, d
              where tm.user_id = p.id and tm.left_at is null and tm.team_id in (d.home_team_id, d.away_team_id)
           ) as recused
      from public.staff_roles r join public.profiles p on p.id = r.user_id
     where r.role in ('owner', 'admin') and p.discord_id is not null
  )
  select jsonb_build_object(
    'captains', coalesce((select jsonb_agg(discord_id) from captains), '[]'::jsonb),
    'admins', coalesce((select jsonb_agg(discord_id) from admins where not recused and discord_id not in (select discord_id from captains)), '[]'::jsonb),
    'recused', (select count(*) from admins where recused)
  );
$$;
revoke execute on function public.dispute_thread_people(uuid) from public, anon, authenticated;
grant execute on function public.dispute_thread_people(uuid) to service_role;
