-- Team Hub: an optional banner image per team, set by its captain/co-captain (or staff), like the logo.
-- Files go in the team-logos bucket at {team_id}/banner-<timestamp>.webp, so the existing team-logos
-- storage policies (that team's captains + non-recused staff) already cover them. teams_guard lets
-- captains change any column it doesn't restrict; staff edits are audited by audit_staff_change.
alter table public.teams
  add column banner_url text
  constraint teams_banner_url_https check (banner_url is null or banner_url ~ '^https://');
