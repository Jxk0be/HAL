-- Step 21: /report in Discord.
--
-- Discord modals hold 5 inputs, so the bot collects map results and screenshots and the site's
-- report form collects the 8-player stat grid. The Discord part is saved as a report_drafts row
-- (not a report_submission), so nothing is compared or counted until the captain finishes the
-- report on the site with submit_report(). The site opens /report/:match?prefill=<draft id>.
--
-- pending_discord_reports holds the command's attachments between the slash command and its
-- modal submit (keyed by Discord user and match).

create table public.pending_discord_reports (
  discord_user_id text not null,
  match_id uuid not null references public.matches (id) on delete cascade,
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default now(),
  primary key (discord_user_id, match_id)
);
create index pending_discord_reports_match_idx on public.pending_discord_reports (match_id);
alter table public.pending_discord_reports enable row level security;
revoke all on public.pending_discord_reports from anon, authenticated;
-- No policies: service role only.

create table public.report_drafts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  -- [{ number, mode_id, map_id, home_score, away_score }]
  maps jsonb not null default '[]'::jsonb check (jsonb_typeof(maps) = 'array'),
  screenshot_paths text[] not null default '{}',
  source public.submission_source not null default 'discord',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, team_id)
);
create index report_drafts_team_idx on public.report_drafts (team_id);
create index report_drafts_created_by_idx on public.report_drafts (created_by);
create trigger set_updated_at before update on public.report_drafts
  for each row execute function public.set_updated_at();
alter table public.report_drafts enable row level security;

-- The team's own players and (non-recused) staff can read a draft; only the bot writes them.
create policy "own team and staff read report drafts" on public.report_drafts
  for select to authenticated
  using ((select public.is_on_team(team_id)) or (select public.can_staff_match(match_id)));
revoke insert, update, delete on public.report_drafts from anon, authenticated;

-- Matches a captain can report now: started, not settled, no open dispute.
create function public.reportable_matches_for(p_actor uuid)
returns table (match_id uuid, week smallint, scheduled_at timestamptz, team_id uuid, home_tag text, away_tag text, opponent_tag text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.week, m.scheduled_at, t.id, ht.tag, at.tag,
         case when m.home_team_id = t.id then at.tag else ht.tag end
    from public.teams t
    join public.matches m on t.id in (m.home_team_id, m.away_team_id)
    join public.teams ht on ht.id = m.home_team_id
    join public.teams at on at.id = m.away_team_id
   where public.is_captain_of_for(p_actor, t.id)
     and m.scheduled_at <= now()
     and m.status not in ('confirmed', 'forfeit', 'cancelled')
     and not exists (select 1 from public.disputes d where d.match_id = m.id and d.status = 'open')
   order by m.scheduled_at desc
   limit 25;
$$;
revoke execute on function public.reportable_matches_for(uuid) from public, anon, authenticated;
grant execute on function public.reportable_matches_for(uuid) to service_role;
