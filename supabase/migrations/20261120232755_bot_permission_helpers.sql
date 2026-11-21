-- Permission helpers that take an explicit user id, for the Discord bot.
-- The bot's Edge Function uses the service role (auth.uid() is null), so it must re-check every
-- permission for the Discord user it is acting for. These mirror the auth.uid() helpers exactly
-- and are callable only by the service role.

create function public.has_role_for(p_user_id uuid, p_role public.staff_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff_roles where user_id = p_user_id and role = p_role);
$$;

create function public.is_admin_for(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_roles where user_id = p_user_id and role in ('owner', 'admin')
  );
$$;

create function public.is_staff_for(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff_roles where user_id = p_user_id);
$$;

create function public.is_captain_of_for(p_user_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teams t
     where t.id = p_team_id and p_user_id in (t.captain_id, t.co_captain_id)
  );
$$;

create function public.is_on_team_for(p_user_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.team_members tm
       where tm.team_id = p_team_id and tm.user_id = p_user_id and tm.left_at is null
    )
    or public.is_captain_of_for(p_user_id, p_team_id);
$$;

create function public.is_party_to_match_for(p_user_id uuid, p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches m
     where m.id = p_match_id
       and (public.is_on_team_for(p_user_id, m.home_team_id) or public.is_on_team_for(p_user_id, m.away_team_id))
  );
$$;

create function public.can_staff_match_for(p_user_id uuid, p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin_for(p_user_id) and not public.is_party_to_match_for(p_user_id, p_match_id);
$$;

create function public.can_staff_team_for(p_user_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin_for(p_user_id) and not public.is_on_team_for(p_user_id, p_team_id);
$$;

revoke execute on function
  public.has_role_for(uuid, public.staff_role), public.is_admin_for(uuid), public.is_staff_for(uuid),
  public.is_captain_of_for(uuid, uuid), public.is_on_team_for(uuid, uuid),
  public.is_party_to_match_for(uuid, uuid), public.can_staff_match_for(uuid, uuid),
  public.can_staff_team_for(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.has_role_for(uuid, public.staff_role), public.is_admin_for(uuid), public.is_staff_for(uuid),
  public.is_captain_of_for(uuid, uuid), public.is_on_team_for(uuid, uuid),
  public.is_party_to_match_for(uuid, uuid), public.can_staff_match_for(uuid, uuid),
  public.can_staff_team_for(uuid, uuid)
  to service_role;
