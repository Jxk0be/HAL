-- Discord role sync and team channels.
-- Database changes enqueue fire-and-forget HTTP calls (pg_net) to the discord-sync Edge Function,
-- which makes Discord match the database. Everything is idempotent: the function recomputes the
-- desired state from the database each time, so duplicate or out-of-order calls are harmless.
--
-- Vault secrets (created once per environment, see supabase/snippets/setup_discord_sync.sql):
--   discord_sync_url    = https://<ref>.supabase.co/functions/v1/discord-sync
--   discord_sync_secret = random shared secret (the function reads it via discord_sync_secret())

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Error log (owner-visible on /admin/discord)
-- ---------------------------------------------------------------------------
create table public.discord_sync_errors (
  id bigint generated always as identity primary key,
  action text not null,
  payload jsonb,
  error text not null,
  created_at timestamptz not null default now()
);
create index discord_sync_errors_created_idx on public.discord_sync_errors (created_at desc);
alter table public.discord_sync_errors enable row level security;
create policy "owner reads sync errors" on public.discord_sync_errors
  for select to authenticated using ((select public.is_owner()));
revoke insert, update, delete on public.discord_sync_errors from anon, authenticated;

alter table public.profiles add column discord_synced_at timestamptz;

-- ---------------------------------------------------------------------------
-- Shared secret for the function (service role only)
-- ---------------------------------------------------------------------------
create function public.discord_sync_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'discord_sync_secret' limit 1;
$$;
revoke execute on function public.discord_sync_secret() from public, anon, authenticated;
grant execute on function public.discord_sync_secret() to service_role;

-- ---------------------------------------------------------------------------
-- Enqueue a sync call (no-op until the Vault secrets exist)
-- ---------------------------------------------------------------------------
create function public.discord_sync_enqueue(p_action text, p_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'discord_sync_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'discord_sync_secret' limit 1;
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('action', p_action) || coalesce(p_payload, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hal-sync-secret', v_secret),
    timeout_milliseconds := 10000
  );
end;
$$;
revoke execute on function public.discord_sync_enqueue(text, jsonb) from public, anon, authenticated;
grant execute on function public.discord_sync_enqueue(text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create function public.discord_sync_teams_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.discord_sync_enqueue('team_removed', jsonb_build_object(
      'team_id', old.id, 'role_id', old.discord_role_id, 'channel_id', old.discord_channel_id));
    return old;
  end if;
  -- Ignore writes that only store Discord ids (the sync function's own updates).
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.name is not distinct from old.name
     and new.tag is not distinct from old.tag
     and new.captain_id is not distinct from old.captain_id
     and new.co_captain_id is not distinct from old.co_captain_id then
    return new;
  end if;
  perform public.discord_sync_enqueue('team_sync', jsonb_build_object('team_id', new.id));
  if tg_op = 'UPDATE' and new.captain_id is distinct from old.captain_id then
    perform public.discord_sync_enqueue('user_sync', jsonb_build_object('user_id', old.captain_id));
  end if;
  if tg_op = 'UPDATE' and old.co_captain_id is not null and new.co_captain_id is distinct from old.co_captain_id then
    perform public.discord_sync_enqueue('user_sync', jsonb_build_object('user_id', old.co_captain_id));
  end if;
  return new;
end;
$$;
create trigger discord_sync after insert or update or delete on public.teams
  for each row execute function public.discord_sync_teams_trigger();

create function public.discord_sync_user_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if tg_table_name = 'profiles' then
    if tg_op = 'UPDATE'
       and new.is_free_agent is not distinct from old.is_free_agent
       and new.activision_id is not distinct from old.activision_id
       and new.platform is not distinct from old.platform
       and new.controller_confirmed_at is not distinct from old.controller_confirmed_at
       and new.pov_ack_at is not distinct from old.pov_ack_at
       and new.banned_until is not distinct from old.banned_until then
      return new;
    end if;
    v_user := new.id;
  elsif tg_op = 'DELETE' then
    v_user := old.user_id;
  else
    v_user := new.user_id;
  end if;
  perform public.discord_sync_enqueue('user_sync', jsonb_build_object('user_id', v_user));
  return coalesce(new, old);
end;
$$;
create trigger discord_sync after insert or update or delete on public.team_members
  for each row execute function public.discord_sync_user_trigger();
create trigger discord_sync after insert or delete on public.staff_roles
  for each row execute function public.discord_sync_user_trigger();
create trigger discord_sync after insert or update on public.profiles
  for each row execute function public.discord_sync_user_trigger();

revoke execute on function public.discord_sync_teams_trigger(), public.discord_sync_user_trigger()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Players who joined the Discord server after logging in: resync on login / profile load.
-- Throttled to once per 10 minutes per player.
-- ---------------------------------------------------------------------------
create function public.request_my_discord_sync()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return false;
  end if;
  update public.profiles
     set discord_synced_at = now()
   where id = v_uid
     and (discord_synced_at is null or discord_synced_at < now() - interval '10 minutes');
  if not found then
    return false;
  end if;
  perform public.discord_sync_enqueue('user_sync', jsonb_build_object('user_id', v_uid));
  return true;
end;
$$;
revoke execute on function public.request_my_discord_sync() from public, anon;
grant execute on function public.request_my_discord_sync() to authenticated;

-- ---------------------------------------------------------------------------
-- Audit log: don't record the sync function storing Discord ids on teams.
-- ---------------------------------------------------------------------------
create or replace function public.audit_staff_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_keys text[];
begin
  if v_uid is null then
    v_role := 'system';
  else
    select r.role::text into v_role
      from public.staff_roles r
     where r.user_id = v_uid
     order by case r.role when 'owner' then 1 when 'admin' then 2 else 3 end
     limit 1;
    if v_role is null then
      return null;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old := public.audit_strip(to_jsonb(old));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := public.audit_strip(to_jsonb(new));
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_keys
      from jsonb_object_keys(v_new) k
     where k not in ('updated_at', 'discord_role_id', 'discord_channel_id', 'discord_message_id', 'discord_synced_at')
       and (v_old -> k) is distinct from (v_new -> k);
    if v_keys is null then
      return null;
    end if;
    select jsonb_object_agg(k, v_old -> k), jsonb_object_agg(k, v_new -> k)
      into v_old, v_new
      from unnest(v_keys) k;
  end if;

  v_row := coalesce(to_jsonb(new), to_jsonb(old));
  insert into public.audit_log (actor_id, actor_role, action, table_name, row_id, old_data, new_data)
  values (
    v_uid,
    v_role,
    lower(tg_op),
    tg_table_name,
    coalesce(
      v_row ->> 'id',
      v_row ->> 'key',
      case when v_row ? 'role' and v_row ? 'user_id' then (v_row ->> 'user_id') || ':' || (v_row ->> 'role') end,
      case when v_row ? 'map_id' and v_row ? 'mode_id' then (v_row ->> 'map_id') || ':' || (v_row ->> 'mode_id') end
    ),
    v_old,
    v_new
  );
  return null;
end;
$$;
