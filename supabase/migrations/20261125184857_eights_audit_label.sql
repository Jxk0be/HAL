-- Readable audit entries for admin 8s decisions: "Admin X settled 8s match #12 (Team B won)".
-- audit_row_label falls back to new_data.name for tables it doesn't know.
create or replace function public.eights_resolve(p_actor uuid, p_match_id uuid, p_winner text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
begin
  if not public.is_admin_for(p_actor) then
    raise exception 'Only admins can settle 8s matches.' using errcode = 'P0001';
  end if;
  if p_winner is not null and p_winner not in ('a', 'b') then
    raise exception 'Pick Team A or Team B.' using errcode = 'P0001';
  end if;
  update public.eights_matches
     set status = case when p_winner is null then 'cancelled' else 'confirmed' end,
         winner = p_winner, resolved_at = now(), resolved_by = p_actor
   where id = p_match_id
  returning number into v_number;
  if v_number is null then
    raise exception 'That 8s match doesn''t exist.' using errcode = 'P0001';
  end if;
  insert into public.audit_log (actor_id, actor_role, action, table_name, row_id, new_data)
  values (p_actor, 'admin', case when p_winner is null then 'cancelled' else 'settled' end,
          'eights_matches', p_match_id::text,
          jsonb_build_object(
            'name', format('8s match #%s', v_number)
                    || case p_winner when 'a' then ' (Team A won)' when 'b' then ' (Team B won)' else '' end));
end;
$$;

revoke execute on function public.eights_resolve(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.eights_resolve(uuid, uuid, text) to service_role;
