-- Step 16: reschedules and disputes on the site.
--
-- Reschedules: request_reschedule / respond_reschedule / cancel_reschedule wrap the existing
-- reschedule_requests_guard rules (24h before the default time, same league week, one pending per
-- match). Pending requests expire 24h before the default time (pg_cron).
--
-- Disputes: open_dispute(match, category, description, evidence) for captains of either team,
-- from the match time until 24h after it (or after confirmation, whichever is later). Opening puts
-- the match under review (status 'disputed'); resolving puts back the status it had before, unless
-- staff changed the result meanwhile. Captains and staff discuss it in dispute_comments.
--
-- notifications_outbox: every reschedule and dispute event is queued here for the Discord bot
-- (steps 18, 20 and 22). Service role only.

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------
create table public.notifications_outbox (
  id bigint generated always as identity primary key,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts smallint not null default 0,
  last_error text
);
create index notifications_outbox_unsent_idx on public.notifications_outbox (created_at) where sent_at is null;
alter table public.notifications_outbox enable row level security;
revoke all on public.notifications_outbox from anon, authenticated;
-- No policies: only the service role (the bot) and our SECURITY DEFINER functions touch it.

create function public.enqueue_notification(p_type text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications_outbox (type, payload) values (p_type, p_payload);
$$;
revoke execute on function public.enqueue_notification(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reschedules
-- ---------------------------------------------------------------------------
create function public.request_reschedule(p_match_id uuid, p_proposed_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  v_team uuid := public.match_captain_team(p_match_id);
  v_id uuid;
begin
  select * into m from public.matches where id = p_match_id;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if v_team is null then
    raise exception 'Only a captain in this match can request a reschedule' using errcode = '42501';
  end if;
  if m.status not in ('scheduled', 'checkin_open') then
    raise exception 'This match can no longer be rescheduled' using errcode = 'P0001';
  end if;
  if p_proposed_at = m.scheduled_at then
    raise exception 'That is already the match time' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reschedule_requests where match_id = p_match_id and status = 'pending') then
    raise exception 'There is already a pending request for this match. Answer or cancel it first.' using errcode = 'P0001';
  end if;
  -- The guard checks: 24h before the default time, same league week, in the future.
  insert into public.reschedule_requests (match_id, requested_by_team_id, requested_by, proposed_at)
  values (p_match_id, v_team, (select auth.uid()), p_proposed_at)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.request_reschedule(uuid, timestamptz) from public, anon;
grant execute on function public.request_reschedule(uuid, timestamptz) to authenticated;

create function public.respond_reschedule(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reschedule_requests;
  v_team uuid;
begin
  select * into r from public.reschedule_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  v_team := public.match_captain_team(r.match_id);
  if v_team is null or v_team = r.requested_by_team_id then
    raise exception 'Only the other team''s captain can answer this request' using errcode = '42501';
  end if;
  if p_accept and r.proposed_at <= now() then
    raise exception 'The proposed time has already passed' using errcode = 'P0001';
  end if;
  update public.reschedule_requests
     set status = case when p_accept then 'accepted'::public.reschedule_status else 'declined'::public.reschedule_status end
   where id = p_request_id;
end;
$$;
revoke execute on function public.respond_reschedule(uuid, boolean) from public, anon;
grant execute on function public.respond_reschedule(uuid, boolean) to authenticated;

create function public.cancel_reschedule(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reschedule_requests;
begin
  select * into r from public.reschedule_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if public.match_captain_team(r.match_id) is distinct from r.requested_by_team_id then
    raise exception 'Only the team that asked can cancel this request' using errcode = '42501';
  end if;
  update public.reschedule_requests set status = 'cancelled' where id = p_request_id;
end;
$$;
revoke execute on function public.cancel_reschedule(uuid) from public, anon;
grant execute on function public.cancel_reschedule(uuid) to authenticated;

-- Pending requests expire 24h before the default time.
create function public.expire_reschedule_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.reschedule_requests r
     set status = 'expired'
    from public.matches m
   where m.id = r.match_id and r.status = 'pending' and now() > m.default_at - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.expire_reschedule_requests() from public, anon, authenticated;

select cron.schedule('hal-expire-reschedules', '*/15 * * * *', 'select public.expire_reschedule_requests()');

create function public.reschedule_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_notification('reschedule_requested', jsonb_build_object(
      'request_id', new.id, 'match_id', new.match_id, 'team_id', new.requested_by_team_id, 'proposed_at', new.proposed_at));
  elsif new.status is distinct from old.status then
    perform public.enqueue_notification('reschedule_' || new.status::text, jsonb_build_object(
      'request_id', new.id, 'match_id', new.match_id, 'team_id', new.requested_by_team_id, 'proposed_at', new.proposed_at));
  end if;
  return null;
end;
$$;
revoke execute on function public.reschedule_requests_notify() from public, anon, authenticated;

create trigger reschedule_requests_notify after insert or update on public.reschedule_requests
  for each row execute function public.reschedule_requests_notify();

-- ---------------------------------------------------------------------------
-- Disputes
-- ---------------------------------------------------------------------------
create type public.dispute_category as enum ('score', 'stats', 'conduct', 'cheating', 'eligibility', 'other');
alter table public.disputes
  add column category public.dispute_category not null default 'other',
  add column match_status_before public.match_status;

grant select (category) on public.disputes to anon, authenticated;
-- Disputes are opened only through open_dispute() (it records the match's previous status).
revoke insert on public.disputes from authenticated;
drop policy "captains open disputes for their matches" on public.disputes;

create or replace view public.disputes_public
with (security_invoker = true) as
  select id, match_id, team_id, opened_by, reason, status, resolution, resolved_by, resolved_at, created_at, category
    from public.disputes;
grant select on public.disputes_public to anon, authenticated;

create table public.dispute_comments (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index dispute_comments_dispute_idx on public.dispute_comments (dispute_id, created_at);
create index dispute_comments_author_idx on public.dispute_comments (author_id);
alter table public.dispute_comments enable row level security;

create policy "parties and staff read dispute comments" on public.dispute_comments
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.is_party_to_match(public.match_of_dispute(dispute_id)))
  );
-- Writes go through add_dispute_comment().
revoke insert, update, delete on public.dispute_comments from anon, authenticated;

-- Opens a dispute with optional evidence: [{ "path": "disputes/{match}/{team}/..." } | { "url": "https://..." , "note": "..." }]
create function public.open_dispute(
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
  v_team uuid := public.match_captain_team(p_match_id);
  v_id uuid;
  e jsonb;
  v_path text;
  v_url text;
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if v_team is null then
    raise exception 'Only a captain or co-captain of either team can open a dispute' using errcode = '42501';
  end if;
  if m.status = 'cancelled' then
    raise exception 'This match was cancelled' using errcode = 'P0001';
  end if;
  if now() < m.scheduled_at then
    raise exception 'Disputes open once the match has started' using errcode = 'P0001';
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

  -- The guard enforces the 24-hour window and sets opened_by.
  insert into public.disputes (match_id, team_id, opened_by, reason, category, match_status_before)
  values (p_match_id, v_team, (select auth.uid()), btrim(p_description), p_category, m.status)
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
    values (v_id, v_path, v_url, left(nullif(btrim(e ->> 'note'), ''), 200), (select auth.uid()));
  end loop;
  return v_id;
end;
$$;
revoke execute on function public.open_dispute(uuid, public.dispute_category, text, jsonb) from public, anon;
grant execute on function public.open_dispute(uuid, public.dispute_category, text, jsonb) to authenticated;

create function public.add_dispute_comment(p_dispute_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.disputes;
  v_id uuid;
begin
  select * into d from public.disputes where id = p_dispute_id;
  if not found then
    raise exception 'Dispute not found' using errcode = 'P0002';
  end if;
  if public.match_captain_team(d.match_id) is null and not public.can_staff_match(d.match_id) then
    raise exception 'Only the captains in this match and league staff can comment' using errcode = '42501';
  end if;
  if d.status <> 'open' then
    raise exception 'This dispute is closed' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Write a comment' using errcode = 'P0001';
  end if;
  insert into public.dispute_comments (dispute_id, author_id, body)
  values (p_dispute_id, (select auth.uid()), left(btrim(p_body), 2000))
  returning id into v_id;
  perform public.enqueue_notification('dispute_comment', jsonb_build_object(
    'dispute_id', p_dispute_id, 'match_id', d.match_id, 'comment_id', v_id));
  return v_id;
end;
$$;
revoke execute on function public.add_dispute_comment(uuid, text) from public, anon;
grant execute on function public.add_dispute_comment(uuid, text) to authenticated;

-- Opening puts the match under review; resolving restores its previous status unless staff
-- changed the result in the meantime.
create function public.disputes_match_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.match_status;
begin
  if tg_op = 'INSERT' then
    select status into v_status from public.matches where id = new.match_id;
    if v_status <> 'disputed' then
      perform set_config('hal.no_audit', 'on', true);
      update public.matches set status = 'disputed' where id = new.match_id;
      perform set_config('hal.no_audit', '', true);
    end if;
    perform public.enqueue_notification('dispute_opened', jsonb_build_object(
      'dispute_id', new.id, 'match_id', new.match_id, 'team_id', new.team_id, 'category', new.category));
  elsif new.status is distinct from old.status then
    if new.status = 'resolved' then
      if not exists (select 1 from public.disputes where match_id = new.match_id and status = 'open' and id <> new.id) then
        update public.matches
           set status = coalesce(new.match_status_before, 'awaiting_reports')
         where id = new.match_id and status = 'disputed'
           and coalesce(new.match_status_before, 'awaiting_reports') <> 'disputed';
      end if;
      perform public.enqueue_notification('dispute_resolved', jsonb_build_object(
        'dispute_id', new.id, 'match_id', new.match_id, 'resolution', new.resolution));
    elsif new.status = 'open' then
      update public.matches set status = 'disputed'
       where id = new.match_id and status not in ('disputed', 'cancelled');
      perform public.enqueue_notification('dispute_reopened', jsonb_build_object('dispute_id', new.id, 'match_id', new.match_id));
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.disputes_match_status() from public, anon, authenticated;

create trigger disputes_match_status after insert or update on public.disputes
  for each row execute function public.disputes_match_status();

-- Reports can't be changed while a dispute is open (admins settle it).
create or replace function public.report_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_internal() or public.can_staff_match(new.match_id) then
    return new;
  end if;
  new.submitted_by := (select auth.uid());
  new.submitted_at := now();
  if exists (
    select 1 from public.matches m
     where m.id = new.match_id and m.status in ('confirmed', 'forfeit', 'cancelled')
  ) then
    raise exception 'This match is already settled; open a dispute instead' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.disputes d where d.match_id = new.match_id and d.status = 'open') then
    raise exception 'A dispute is open on this match. Admins will settle it; add a comment to the dispute instead.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
