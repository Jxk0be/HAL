-- American spelling in player-facing error messages ("cancelled" -> "canceled"). Only the raise
-- messages change; the 'cancelled' status values stay as they are.
do $$
declare
  f regprocedure;
  def text;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('open_dispute_as', 'eights_request_cancel', 'preseason_propose_as', 'preseason_respond_as', 'preseason_cancel_proposal_as')
  loop
    def := pg_get_functiondef(f);
    def := replace(def, 'raise exception ''This match was cancelled''', 'raise exception ''This match was canceled''');
    def := replace(def, 'raise exception ''This preseason match was cancelled.''', 'raise exception ''This preseason match was canceled.''');
    def := replace(def, 'raise exception ''This proposal was already answered or cancelled.''', 'raise exception ''This proposal was already answered or canceled.''');
    def := replace(def, 'so it can''''t be cancelled.''', 'so it can''''t be canceled.''');
    execute def;
  end loop;
end
$$;
