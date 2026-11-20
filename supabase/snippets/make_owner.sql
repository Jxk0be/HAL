-- One-time: make a user the league owner, by their Discord display name.
-- 1. Log in to the site with Discord once (that creates your profile).
-- 2. Put your Discord display name below (as shown on your HAL profile page).
-- 3. Run this in the Supabase SQL editor. It is recorded in the public audit log as "HAL bot".
-- It refuses to run if the name matches no profile or more than one.

do $$
declare
  v_name constant text := 'YOUR_DISCORD_NAME';   -- <- change this
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from public.profiles
   where lower(discord_username) = lower(v_name);

  if v_ids is null then
    raise exception 'No profile named "%". Log in to the site first, then check the name on your profile page.', v_name;
  elsif cardinality(v_ids) > 1 then
    raise exception '% profiles are named "%". Grant the role by id instead.', cardinality(v_ids), v_name;
  end if;

  insert into public.staff_roles (user_id, role)
  values (v_ids[1], 'owner')
  on conflict (user_id, role) do nothing;

  raise notice 'Owner role granted to % (%).', v_name, v_ids[1];
end;
$$;
