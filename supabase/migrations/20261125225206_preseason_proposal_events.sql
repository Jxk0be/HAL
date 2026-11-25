-- Proposal notifications say what happened, so the bot posts the request once and the outcome once.
do $$
declare
  v text;
  v_new text;
  f text;
  v_event text;
begin
  foreach f in array array['preseason_propose_as', 'preseason_respond_as', 'preseason_cancel_proposal_as'] loop
    v_event := case when f = 'preseason_propose_as' then 'proposed' else 'answered' end;
    v := pg_get_functiondef(('public.' || f)::regproc);
    v_new := replace(v,
      'jsonb_build_object(''proposal_id'', ',
      format('jsonb_build_object(''event'', %L, ''proposal_id'', ', v_event));
    if v_new = v then raise exception '% patch did not apply', f; end if;
    execute v_new;
  end loop;
end $$;
