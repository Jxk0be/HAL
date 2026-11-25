-- Optional public "about" text for a team, edited by its captain/co-captain (and staff).
alter table public.teams
  add column description text
  constraint teams_description_length check (char_length(description) <= 500);

-- teams_guard already lets captains change any column it doesn't list, so description is allowed.
-- Only the error text changes to mention it.
do $$
declare v text;
begin
  v := pg_get_functiondef('public.teams_guard'::regproc);
  v := replace(v, 'Captains can only change the team name, tag, logo and co-captain',
                  'Captains can only change the team name, tag, logo, description and co-captain');
  execute v;
end $$;
