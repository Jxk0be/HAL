-- Free agent posts: drop the one-new-post-per-24-hours limit.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.lfg_upsert_as(uuid,text,text,text)'::regprocedure) into v_def;
  v_new := regexp_replace(
    v_def,
    E'  if v_post\\.id is null then\\n    select max\\(created_at\\) into v_last.*?end if;\\n  end if;\\n',
    '',
    's'
  );
  if v_new = v_def then
    raise exception 'lfg_upsert_as patch did not apply';
  end if;
  execute v_new;
end $$;
