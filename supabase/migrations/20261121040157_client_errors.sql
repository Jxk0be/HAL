-- Step 23: client error monitoring and an admin health summary.
--
-- The site reports uncaught errors through log_client_error() (anyone, including visitors).
-- It is rate-limited: 10 per minute per signed-in user (or per anonymous session id) and 300
-- per minute overall, and long fields are truncated. Admins read the latest errors, the bot's
-- errors and the outbox backlog through admin_health().

create table public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references public.profiles (id) on delete set null,
  session_id text,
  message text not null,
  stack text,
  url text,
  user_agent text,
  release text
);
create index client_errors_created_idx on public.client_errors (created_at desc);
create index client_errors_user_idx on public.client_errors (user_id);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
grant select on public.client_errors to authenticated;
create policy "admins read client errors" on public.client_errors
  for select to authenticated using ((select public.is_admin()));

create function public.log_client_error(
  p_message text,
  p_stack text default null,
  p_url text default null,
  p_user_agent text default null,
  p_session_id text default null,
  p_release text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session text := left(nullif(btrim(coalesce(p_session_id, '')), ''), 64);
begin
  if nullif(btrim(coalesce(p_message, '')), '') is null then
    return false;
  end if;
  if (select count(*) from public.client_errors where created_at > now() - interval '1 minute') >= 300 then
    return false;
  end if;
  if (select count(*) from public.client_errors
       where created_at > now() - interval '1 minute'
         and ((v_uid is not null and user_id = v_uid) or (v_uid is null and v_session is not null and session_id = v_session))) >= 10 then
    return false;
  end if;
  insert into public.client_errors (user_id, session_id, message, stack, url, user_agent, release)
  values (v_uid, v_session, left(p_message, 1000), left(p_stack, 4000), left(p_url, 500), left(p_user_agent, 300), left(p_release, 64));
  return true;
end;
$$;
revoke execute on function public.log_client_error(text, text, text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text, text, text) to anon, authenticated;

-- Keep 30 days of client errors.
select cron.schedule('hal-prune-client-errors', '17 4 * * *', $$delete from public.client_errors where created_at < now() - interval '30 days'$$);

create function public.admin_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'client_errors_24h', (select count(*) from public.client_errors where created_at > now() - interval '24 hours'),
    'bot_errors_24h', (select count(*) from public.discord_sync_errors where created_at > now() - interval '24 hours'),
    'outbox_waiting', (select count(*) from public.notifications_outbox where sent_at is null),
    'outbox_failing', (select count(*) from public.notifications_outbox where sent_at is null and attempts > 0),
    'outbox_oldest', (select min(created_at) from public.notifications_outbox where sent_at is null),
    'client_errors', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'at', created_at, 'message', message, 'url', url, 'stack', left(stack, 600), 'release', release) order by id desc)
        from (select * from public.client_errors order by id desc limit 30) x
    ), '[]'::jsonb),
    'bot_errors', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'at', created_at, 'action', action, 'error', left(error, 600)) order by id desc)
        from (select * from public.discord_sync_errors order by id desc limit 30) x
    ), '[]'::jsonb),
    'cron', coalesce((
      select jsonb_agg(jsonb_build_object('job', j.jobname, 'schedule', j.schedule, 'active', j.active,
               'last_status', r.status, 'last_run', r.start_time) order by j.jobname)
        from cron.job j
        left join lateral (select status, start_time from cron.job_run_details d where d.jobid = j.jobid order by start_time desc limit 1) r on true
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.admin_health() from public, anon;
grant execute on function public.admin_health() to authenticated;
