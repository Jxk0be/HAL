-- Optional, cast preseason matches live in public.matches with their own stage (week 0) so check-in,
-- reporting, disputes and casting all work; standings and stats ignore them (next migration).
alter type public.match_stage add value if not exists 'preseason';
