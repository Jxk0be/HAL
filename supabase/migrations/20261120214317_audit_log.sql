-- Public audit log.
-- Every write by a staff member (owner, admin, caster) or by the service role (bot, Edge Functions,
-- SQL editor: actor_role 'system') on league tables is recorded by audit_staff_change(). Normal
-- captain/player actions are not logged. Updates store only the changed columns. Private fields are
-- stripped before storing. audit_log is append-only for every role. The public reads it through
-- audit_log_public (actor name + readable summary); direct reads of audit_log are staff-only.

-- Any staff role.
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff_roles where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Private field stripping
-- ---------------------------------------------------------------------------
create function public.audit_strip(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(coalesce(p, '{}'::jsonb)) e
   where e.key not in ('discord_id', 'discord_thread_id', 'email', 'evidence_paths', 'screenshot_paths')
     and e.key !~ '(_token|_secret)$';
$$;

-- ---------------------------------------------------------------------------
-- The audit trigger
-- ---------------------------------------------------------------------------
create function public.audit_staff_change()
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
    v_role := 'system';            -- service role: the bot, Edge Functions, the SQL editor
  else
    select r.role::text into v_role
      from public.staff_roles r
     where r.user_id = v_uid
     order by case r.role when 'owner' then 1 when 'admin' then 2 else 3 end
     limit 1;
    if v_role is null then
      return null;                 -- captains and players are not audit-logged
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
     where k <> 'updated_at' and (v_old -> k) is distinct from (v_new -> k);
    if v_keys is null then
      return null;                 -- nothing visible changed
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
revoke execute on function public.audit_staff_change() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'teams', 'team_members', 'team_invites', 'roster_requests', 'matches', 'match_maps',
    'player_map_stats', 'stat_mismatches', 'disputes', 'free_agent_posts', 'penalties', 'seasons',
    'divisions', 'staff_roles', 'game_modes', 'maps', 'map_modes', 'gentlemens_agreements',
    'checkins', 'reschedule_requests', 'app_settings'
  ] loop
    execute format(
      'create trigger audit_staff_change after insert or update or delete on public.%I
         for each row execute function public.audit_staff_change()', t);
  end loop;
end;
$$;

-- set_broadcast no longer writes its own audit row: the matches trigger records it.
create or replace function public.set_broadcast(p_match_id uuid, p_live boolean, p_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_caster() or public.is_admin()) then
    raise exception 'Only casters and admins can set a broadcast' using errcode = '42501';
  end if;
  if public.is_party_to_match(p_match_id) then
    raise exception 'You cannot take staff actions on your own team''s match' using errcode = '42501';
  end if;
  if p_live and (p_url is null or p_url !~ '^https://') then
    raise exception 'A live broadcast needs an https:// stream link' using errcode = 'P0001';
  end if;

  update public.matches
     set broadcast_live = p_live,
         broadcast_url = case when p_live then p_url else broadcast_url end,
         broadcast_by = (select auth.uid())
   where id = p_match_id;
  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Append-only, for every role (including the owner and the service role)
-- ---------------------------------------------------------------------------
create function public.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The audit log is append-only' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update_delete before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

revoke insert, update, delete, truncate on public.audit_log from anon, authenticated, service_role;

-- Direct reads are staff-only; the public uses audit_log_public.
drop policy "audit log is public" on public.audit_log;
revoke select on public.audit_log from anon;
create policy "staff read the raw audit log" on public.audit_log
  for select to authenticated using ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Readable summaries
-- ---------------------------------------------------------------------------
-- A short label for the row an audit entry is about, using current names where the row still exists.
create function public.audit_row_label(p_table text, p_row_id text, p_data jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.try_uuid(p_row_id);
  v_label text;
  v_user uuid;
begin
  case p_table
    when 'matches' then
      select format('match %s vs %s (week %s)', ht.tag, at.tag, m.week) into v_label
        from public.matches m
        join public.teams ht on ht.id = m.home_team_id
        join public.teams at on at.id = m.away_team_id
       where m.id = v_id;
    when 'match_maps' then
      select format('map %s of %s vs %s (week %s)', mm.map_number, ht.tag, at.tag, m.week) into v_label
        from public.match_maps mm
        join public.matches m on m.id = mm.match_id
        join public.teams ht on ht.id = m.home_team_id
        join public.teams at on at.id = m.away_team_id
       where mm.id = v_id;
    when 'teams' then
      select format('team %s [%s]', t.name, t.tag) into v_label from public.teams t where t.id = v_id;
      v_label := coalesce(v_label, 'team ' || (p_data ->> 'name'));
    when 'team_members' then
      select format('%s on %s', coalesce(p.discord_username, 'a player'), t.name) into v_label
        from public.team_members tm
        join public.teams t on t.id = tm.team_id
        left join public.profiles p on p.id = tm.user_id
       where tm.id = v_id;
      v_label := coalesce(v_label, 'a roster spot');
    when 'team_invites' then
      select format('invite for %s to %s', coalesce(p.discord_username, 'a player'), t.name) into v_label
        from public.team_invites i
        join public.teams t on t.id = i.team_id
        left join public.profiles p on p.id = i.user_id
       where i.id = v_id;
    when 'staff_roles' then
      v_user := public.try_uuid(split_part(p_row_id, ':', 1));
      select format('%s role for %s', split_part(p_row_id, ':', 2), coalesce(p.discord_username, 'a user'))
        into v_label from public.profiles p where p.id = v_user;
      v_label := coalesce(v_label, split_part(p_row_id, ':', 2) || ' role');
    when 'seasons' then
      select 'season ' || s.name into v_label from public.seasons s where s.id = v_id;
    when 'divisions' then
      select 'division ' || d.name into v_label from public.divisions d where d.id = v_id;
    when 'game_modes' then
      select 'mode ' || g.name into v_label from public.game_modes g where g.id = v_id;
    when 'maps' then
      select 'map ' || mp.name into v_label from public.maps mp where mp.id = v_id;
    when 'map_modes' then
      select format('map pool entry %s / %s', mp.name, g.name) into v_label
        from public.maps mp, public.game_modes g
       where mp.id = public.try_uuid(split_part(p_row_id, ':', 1))
         and g.id = public.try_uuid(split_part(p_row_id, ':', 2));
    when 'penalties' then
      v_label := 'penalty' || coalesce(' (' || (p_data ->> 'type') || ')', '');
    when 'app_settings' then
      v_label := 'setting ' || p_row_id;
    else
      null;
  end case;

  return coalesce(
    v_label,
    coalesce(p_data ->> 'name', replace(regexp_replace(p_table, 's$', ''), '_', ' ') || ' ' || left(coalesce(p_row_id, ''), 8))
  );
end;
$$;

-- "Admin jake changed match ALP vs BRV (week 2): home_series 2 → 3"
create function public.audit_summary(
  p_actor_role text,
  p_actor_name text,
  p_action text,
  p_table text,
  p_row_id text,
  p_old jsonb,
  p_new jsonb
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws(' ',
           case when p_actor_role = 'system' then 'HAL bot'
                else initcap(coalesce(p_actor_role, 'staff')) || ' ' || coalesce(p_actor_name, 'unknown') end,
           case p_action when 'insert' then 'added' when 'update' then 'changed' when 'delete' then 'removed'
                else p_action end,
           public.audit_row_label(p_table, p_row_id, coalesce(p_new, p_old)))
         || case when p_action = 'update' then
              ': ' || (
                select string_agg(
                         format('%s %s → %s', replace(k, '_', ' '),
                                coalesce(p_old ->> k, '—'), coalesce(p_new ->> k, '—')),
                         ', ' order by k)
                  from jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) k
              )
            else '' end;
$$;

-- Public feed (the raw table stays staff-only; private fields were stripped at write time).
create function public.audit_log_feed()
returns table (
  id bigint,
  created_at timestamptz,
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text,
  table_name text,
  row_id text,
  old_data jsonb,
  new_data jsonb,
  summary text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.created_at, a.actor_id, p.discord_username, a.actor_role, a.action, a.table_name,
         a.row_id, a.old_data, a.new_data,
         public.audit_summary(a.actor_role, p.discord_username, a.action, a.table_name, a.row_id,
                              a.old_data, a.new_data)
    from public.audit_log a
    left join public.profiles p on p.id = a.actor_id
   order by a.id desc;
$$;

create view public.audit_log_public
with (security_invoker = true) as
  select * from public.audit_log_feed();

revoke execute on function public.audit_row_label(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.audit_summary(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.audit_log_feed() to anon, authenticated;
grant select on public.audit_log_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Discord #audit-log hook (stub; not attached yet)
-- ---------------------------------------------------------------------------
-- Posts each new audit row id to the discord-sync Edge Function, which reads the public feed and
-- posts the summary to #audit-log. Needs pg_net and the Vault secrets discord_sync_url and
-- discord_sync_secret. Enable in the bot step with:
--   create trigger audit_log_notify_discord after insert on public.audit_log
--     for each row execute function public.audit_log_notify_discord();
create function public.audit_log_notify_discord()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'discord_sync_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'discord_sync_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('type', 'audit_log', 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hal-secret', v_secret)
  );
  return null;
end;
$$;
revoke execute on function public.audit_log_notify_discord() from public, anon, authenticated;
