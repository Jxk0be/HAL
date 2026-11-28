# Blackhat Invitational League (BIL): application overview

A complete description of the website and Discord bot as built (late November 2026, after the Scrim Center-style refresh), written so it can be handed to a model as the input for a step-by-step rebuild guide. It describes *what* the product does and the rules it enforces, plus the architecture that makes it work. Exact file names are given where they help; a rebuild does not have to copy them.

---

## 1. What it is

Blackhat Invitational League (BIL, casually "Blackhat"; formerly Heaven's Arena League, HAL) is a free, invite-style competitive **Call of Duty: Modern Warfare 4** league for **North American, controller-only, 18+ players ranked Gold to Crimson**. The champion team wins $250 ($62.50 per starter), paid by PayPal or Venmo within 7 days of the final.

The product has two halves that share one database:

1. **A website** where players sign in with Discord, build teams, view schedules/standings/stats, check in, report results with screenshots, request reschedules, open disputes, and watch broadcasts. Staff run the whole league from an admin panel.
2. **A serverless Discord bot** that mirrors the league into the community Discord server: roles and private team channels, match reminders, check-in buttons, result posts, live "boards" (rosters, standings, schedule), slash commands for reporting/rescheduling/disputes/LFG, and a casual 8-player pick-up queue ("8s").

Core principles that shape everything:
- **Every permission is enforced in Postgres** (RLS + SECURITY DEFINER functions). The UI and bot only mirror checks for convenience.
- **Staff can never act on a match involving their own team** ("recusal"), enforced in the database, including for the owner.
- **Public audit log:** every staff write is recorded (actor, action, table, row, old → new, time) and anyone can read it, with private fields stripped.
- **Double-entry reporting:** both captains submit the full scoreboard; matching values confirm automatically, differences go to an admin queue.
- **Game data is data:** modes, maps and Gentlemen's Agreements are admin-editable tables, never hard-coded.
- League times are defined in **America/New_York** and shown in each viewer's local time (Eastern on hover).
- All copy is American English.

---

## 2. Tech stack and infrastructure

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces: `apps/web`, `supabase/`, `scripts/`, `rules/`, `docs/` |
| Frontend | Vue 3 (`<script setup lang="ts">` only), TypeScript strict with `noUncheckedIndexedAccess`, Vite, Vue Router, Pinia (session/user state only), `@vueuse/core`, Tailwind CSS v4 (`@tailwindcss/vite`, tokens in `@theme`), markdown-it + DOMPurify for the rulebook. No component libraries. |
| Backend | Supabase: Postgres (RLS on every table), Auth (Discord OAuth, PKCE), Storage, Realtime, Edge Functions (Deno), pg_cron, pg_net, Vault |
| Bot | Three Supabase Edge Functions, no gateway process: `discord-interactions` (HTTP interactions), `discord-scheduler` (cron-driven), `discord-sync` (roles/channels/boards) |
| Hosting | Netlify SPA with strict CSP and security headers (`netlify.toml`) |
| CI | GitHub Actions: typecheck, lint, Vitest, build, Deno tests, `supabase db lint`; pushes to `main` run `supabase db push` and deploy the functions |
| Tests | Vitest for web logic; Deno tests for bot builders/parsers; SQL test scripts in `supabase/tests/*.sql` that run in a rolled-back block and end with `ALL TESTS PASSED` |
| Scripts | `scripts/register-commands.ts` (slash command registration), `scripts/render-brand.py` (rebuilds every logo/icon/OG image from one master PNG), type generation |

Commands: `pnpm dev` (port 5174), `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, `pnpm db:types`, `pnpm commands:register`, `pnpm test:functions`.

The database is built from ~64 additive, timestamp-named migrations. Generated Supabase types live in `apps/web/src/types/database.ts`.

---

## 3. League rules the software enforces

The rulebook (`rules/rulebook.md`, 15 sections: General, Eligibility, Teams and Rosters, Substitutes, Season Format, Scheduling and Reschedules, Match Day, Game Settings/Maps/GAs, Reporting and Stats, Disputes, Conduct and Integrity, Penalties, Prizes, League Staff and Conflicts of Interest, Changes) is the source of truth. The software enforces:

**Eligibility.** 18+ (confirmed at signup), controller only (PC allowed with controller; admins may ask for a live screen-share), NA only. Rank bracket Gold–Crimson: each player sets `cod_rank` (higher of previous-CoD peak and current). Iridescent players need an admin-approved exception; Top 250 and below Gold are ineligible. A profile is "complete" only with an Activision ID (`Name#1234567`, unique ignoring case), platform, 18+ and controller confirmations, and an eligible rank.

**Season format.** Up to 16 teams per division; more than 16 → Premier and Contender divisions (the model supports any number of divisions). Optional preseason → 8-week regular season, 2 matches/week (default Tue & Thu 9:00 PM ET, stored as season settings) → top-8 playoffs over 2 weeks (1v8, 4v5, 2v7, 3v6) → offseason. Series are best-of-5; higher seed picks first, picks alternate.

**Season settings** (on `seasons`): status (`draft → signups → regular → playoffs → … `), signups open date, start date, regular weeks, matches per week, playoff team count, match nights, match time, time zone, roster lock date, max roster (7), max starters (4), max subs (3), max roster changes (3), prize text. Only one active season at a time.

**Rosters.** One team per player per season. Up to 4 starters (captain included) + 3 subs. One captain, one optional co-captain. Everyone who signs in is a free agent by default. Captains invite players while they have an open spot; the player accepts/declines (site or Discord DM). Accepting joins immediately (no admin approval), cancels their other invites and takes them off the free-agent list. Invites expire after 7 days. Players can leave (a captain must transfer captaincy first); captains can remove players. During regular season/playoffs each add/drop counts toward 3 roster changes. Rosters lock ~2 weeks before playoffs. Playoff eligibility needs 2+ regular-season matches. A dropped player can't join another team in the same division for 7 days. Teams start `pending` and need 4 players before an admin can approve them. Teams can only be created during signups (staff exempt).

**Substitutes.** Subs must be on the roster 24h before a match. Emergency sub: if a team has fewer than 4 eligible players, the captain marks players out and requests a free agent; the free agent must accept, then an admin approves, for one match only (max 2 per team per match, capped at `4 − available`).

**Scheduling.** Reschedules need both captains' agreement at least 24h before the default time; the new time must be in the same league week (by Sunday 11:59 PM ET) and in the future; one pending request per match; unanswered requests expire 24h before the default time and the default stands.

**Match day.** Bot reminders at 24h and 1h. Check-in opens 15 minutes before and stays open until 30 minutes after; the captain/co-captain selects exactly 4 eligible players. 15 min late = map forfeit, 30 min = series forfeit. Disconnect rules and one 5-minute tactical pause per team per series (rule text only). 2 forfeits in a season = team removed and remaining matches recorded as losses.

**Reporting.** Both captains submit series result, per-map mode/map/score/winner with a screenshot, and every player's kills/deaths/score. Matching series and map data confirm the result and update standings. Differing player stats create mismatch rows for admins (the result still confirms). Differing map data puts the match in `disputed`. If one captain hasn't reported 24h after the match, the other's report stands if it has screenshots for every map.

**Disputes.** Opened by a captain within 24h with evidence; categories: score, stats, conduct, cheating, eligibility, other. Admin decisions are final.

**Integrity.** Cheat devices → team banned for the season, player permanently. Conduct → suspension/ban. Exploits → map loss.

**Standings tiebreakers (rule 5.5).** Series wins → map differential → head-to-head among tied teams → deciding-map round differential → flagged for an admin decision.

---

## 4. Roles and permissions

| Role | Can do |
|---|---|
| **Owner** | Everything: seasons, settings, divisions, user roles, Discord settings and resync, payouts, every admin action, except staff actions on their own team's matches. The last owner can't be removed. |
| **Admin** | Mismatches, disputes, team approvals, roster/emergency-sub approvals, rank exceptions, add/edit/remove matches and results, teams, free agent posts, bans and penalties, modes & maps, schedule and playoffs, preseason, announcements, health. Not roles or seasons. |
| **Caster** | Claim a match, go live with a stream link (shows a live banner), end the broadcast, add a replay link. Nothing else. |
| **Captain / co-captain** | Manage own team (name, tag, logo, description, invites, roles, removals), check in, report, reschedule, open disputes, recruiting post, preseason scheduling. Only the captain picks the co-captain, transfers captaincy or disbands. |
| **Player** | Profile, free agent post, accept invites, leave team, volunteer as sub, play 8s. |
| **Staff-only account** | `profiles.is_player = false`: staff who don't play. Excluded from every player gate, directory and free-agent list. |

Recusal: `can_staff_match(match)` = admin and not a party to the match; `can_staff_team(team)` likewise. Every staff RPC re-checks this and raises `Recused: …`. The UI greys out recused items.

---

## 5. Website

### Look and feel
Esports app look (modeled on scrimcenter.com, in Blackhat colors): near-black surfaces, neutral gray text, **one red accent** (`accent` #FF4F5C for text/borders/tints; solid fills use `brand` #D91F2B with white text). Green `win` and coral `loss` only for results. Headings in Chakra Petch uppercase (giant `title-xl` page titles), body in Barlow (all self-hosted). Diagonal-striped cards, 2px top accent borders (red only for what needs the viewer's action), eyebrows with a short red bar, tabular numerals on every stat. Brand: hooded-figure emblem over a BLACKHAT / INVITATIONAL LEAGUE banner, with `full`, `lockup` and `emblem` variants. Every page works at 375px wide, with accessible labels, visible focus and keyboard-friendly modals (native `<dialog>`).

Shared UI primitives (all hand-built): Button, Card (red/neutral accent, striped, interactive), Badge, Table (sortable, slot per cell), Tabs (underline or pill, optional URL-hash sync), Select, Input, Checkbox, Modal, Toast host + `useToast`, Empty state, Skeleton, Avatar, Pagination, Countdown, Stepper (season progress), Stat tile, Podium (top 3), TeamLogo, ScoreChip, PlatformBadge, RankBadge, LeagueTime (local time, ET on hover).

App shell: skip link, rotating **Live banner**, a fixed **icon rail** on desktop (Home, Dashboard, Season, Matches, Teams, Leaderboard, Watch, Free Agents, plus "More": Standings, Players, 8s, Maps, Rules, Audit Log, Admin), a sticky **top bar** with a scrolling **results ticker** (last 20 results, one shared realtime channel) and sign-in/user menu, a **bottom tab bar** on phones (Home, Season, Matches, Teams, More drawer), account notice bar, footer, toast host. Login, onboarding and the logged-out home page use a slim public header instead.

### Public pages
- **Home** (`/`): logged out, a landing page (ticker strip, centered logo hero with live counts of players/teams/matches and a Discord chip, "How the league works" card grid, live/next/results, red "Gold to Crimson. Prove it." CTA band); signed in, the app home with a dashboard shortcut, next match night, latest results, top of the table and season leaders.
- **Season hub** (`/season`, `/season/:id` for past seasons): banner hero (owner-uploaded), status chips, season-progress stepper, share button, season switcher, sticky "next up" countdown bar with a context button (Create a team / Check in / View my match) and teams-approved count, and tabs Overview (about, key dates, settings, divisions, champion for finished seasons), Standings, Matches, Bracket, Teams, Rules.
- **8s** (`/8s`): read-only view of the pick-up queue (meter), live matches with vote countdowns, recent results and the 8s leaderboard; joining stays in Discord.
- **Matches** (`/matches`): full season schedule and results with week pills (Preseason, W1…, Playoffs), a team filter, matches grouped by night, compact rows on phones and cards on larger screens, live and broadcast links. Realtime updates.
- **Match detail** (`/matches/:id`): striped hero with both teams, a huge VS (before) or series score (after), countdown, map strip; series and per-map scores, box score per map, screenshots (signed URLs; each team sees only its own until settled, then both), check-ins (teams/staff only), and, depending on who is viewing, cards for Check-in, Reschedule, Emergency sub, Dispute, Report, Replay.
- **Watch** (`/watch`): embedded live stream + chat (Twitch, YouTube via youtube-nocookie, Kick), upcoming cast schedule, recent replays.
- **Standings** (`/standings`): table per division with tiebreakers, last-5 form, plus stat leaderboards. Links to **Playoffs** (`/playoffs`), a bracket per division built from playoff matches with "Winner of QF 1" placeholders and a champion banner.
- **Leaderboard** (`/leaderboard`): tabs Players (top-3 podium by the current sort with CoD rank badges, then every player with confirmed stats: K/D, +/-, average score, maps; incomplete lines flagged), Teams (series, maps, map diff, win %, podium) and Hall of Champions (each finished season's champion, final score and starters).
- **Teams** (`/teams`, `/teams/:id`): "Find your squad" grid of team cards (banner, logo, status, recruiting chip, record, starter avatars, "Interested" on recruiting teams) with search and filter pills; team page with a banner hero, stat tiles (record, map diff, standing, forfeits) and tabs Roster, Matches, Stats, Recruiting.
- **Players** (`/players`, `/players/:id`): searchable, paged directory; profile with bio, main role, profile color, social handles (Twitch/YouTube/X/TikTok), rank, team, "Looking for a team" card, season stats, career breakdown (record, MVPs, map wins, K/D trend chart by week, modes, maps, best match).
- **Free Agents** (`/free-agents`): board of free agents (posts first) with search and platform/role filters; captains with an open spot see "Invite to team". Tabbed with **Teams recruiting** (`/teams-recruiting`): teams' posts looking for a starter/sub with roles (AR/SMG/Flex), availability, note; players click "Interested".
- **Maps** (`/maps`): the current map pool grouped by mode.
- **Rules** (`/rules`): a designed page rendered from the bundled `rules/rulebook.md`: sticky table of contents, numbered rules with linkable anchors (`/rules#4`, `/rules#4.2`), IMPORTANT/NOTE callouts, search, last-updated date from git, print styles. Never links to GitHub.
- **Audit Log** (`/audit-log`): public feed of staff/bot actions with human summaries; filter by table and actor.
- **Login** (`/login`): split screen (pitch with drifting waves + sign-in card with "Continue with Discord" in Discord blue). Discord OAuth only (scopes `identify email`; email never shown). `/auth/callback` → onboarding if incomplete, else the dashboard. Redirects pass through a same-site `safeNext()`.

### Signed-in pages
- **Dashboard** (`/dashboard`): next-match hero with the right action (check in / report / watch), a to-do list (team invites with inline accept/decline, emergency-sub requests, reschedule requests, matches to report, open disputes, profile or rank problems), team snapshot (record, standing, roster, roster changes, roster-lock countdown), my season stats, season progress and latest results. Staff-only accounts see admin queue tiles.
- **Onboarding** (`/onboarding`) and **My Profile** (`/profile`): profile form (Activision ID, platform, rank, 18+ and controller confirmations), customization (bio, role, color, socials), free agent post, pending team invites, emergency-sub invites, "list me as a free agent" toggle.
- **My Team** (`/my-team`): create a team (name, 2–5 char tag that keeps case, logo upload ≤1 MB PNG/JPG/WebP) or manage it (including a 3:1 team banner): roster with starter/sub roles, invite search, co-captain, transfer captaincy, remove/leave, disband, description, recruiting post with interested players, preseason card, requests panel (reschedules), pending-approval/denial note.
- **Report match** (`/report/:matchId`): the double-entry form. Series state, per-map mode/map/score, screenshot upload (compressed in browser to WebP ≤1920px), keyboard-first 8-player stat grid (Enter = next cell, arrows, paste spreadsheet rows), draft autosave, prefill from a Discord `/report` draft, status panel showing whether the opponent has reported and which fields differ (never their values before settlement).

### Admin panel (`/admin`, a grouped "Control center" column next to the rail on desktop with queue-count badges, tabs on phones)
- **Overview**: stat tiles for pending work (red when non-zero) and the next 24 hours of matches with their check-in state.
- **Casting desk** (casters + admins): claim, go live with a link, end, replay link.
- **Mismatch queue** + detail page: side-by-side values with screenshots; pick home / away / custom (keys 1, 2, E, N). Settling the last mismatch confirms the match if the maps add up.
- **Disputes**: open disputes with evidence and comments; resolve/reopen with a decision.
- **Roster approvals**: emergency sub approvals, Iridescent rank exceptions.
- **Season & schedule** (tabs): Season settings (owner, including the season banner), Team approvals (approve/deny with note), Divisions (owner), Modes & maps, Schedule generator (circle-method round robin over weeks × nights, balanced home/away, byes, seeded shuffle "Regenerate", saved atomically), Playoffs generator.
- **Preseason**: send invites, generate pairings, see proposals, cancel pairings.
- **Modes & maps**: add a mode, then its maps (a map can belong to several modes).
- **Content**: matches & results (edit, set result, clear result, forfeit), teams (edit, delete), free agent posts (take down), players & bans (ban with reason/duration, stat flags).
- **Announcements**: previews and posts season announcements to Discord; toggle automatic posts.
- **Health**: site errors, bot errors, outbox backlog, cron job status.
- **Discord** (owner): channel IDs for every bot channel, full resync, post channel guides, latest sync errors.
- **User roles** (owner): grant/revoke owner/admin/caster, toggle staff-only accounts.

---

## 6. Data model (Postgres, all RLS-enabled)

**People & roles:** `profiles` (Discord id/username/avatar, Activision ID, platform, rank, confirmations, free-agent flag, is_player, bio/role/color/socials; private columns hidden by column grants), `staff_roles`, `penalties` (public bans), `player_stat_flags`.

**Seasons & teams:** `seasons` (including `banner_url`), `divisions`, `teams` (name, tag, logo, banner, description, captain, co-captain, status pending/approved/removed, roster changes used, forfeit count, Discord role/text/voice channel ids), `team_members` (role starter/sub, joined_at, left_at), `team_invites`, `roster_requests` (emergency subs), `match_absences`, `free_agent_posts`, `team_recruit_posts`, `team_recruit_interest`.

**Game data:** `game_modes`, `maps`, `map_modes`, `gentlemens_agreements`.

**Matches:** `matches` (season, division, stage preseason/regular/playoffs, week, round, home/away, scheduled_at, default_at, status scheduled/checkin_open/in_progress/reported/disputed/confirmed/forfeit/cancelled, series score, winner, result_source double_entry/single_report/admin/forfeit, broadcast fields, vod_url, Discord match-channel ids), `match_maps`, `player_map_stats`, `checkins`, `report_submissions`, `report_drafts`, `stat_mismatches`, `reschedule_requests`, `disputes`, `dispute_evidence`, `dispute_comments`.

**Preseason:** `preseason_interest`, `preseason_pairings`, `preseason_proposals`.

**8s:** `eights_queue`, `eights_matches`, `eights_players`, `eights_votes`, `eights_reports`, `eights_cancel_requests`.

**Bot & ops:** `app_settings` (Discord role/channel ids, guides), `notifications_outbox`, `bot_events` (idempotency claims), `discord_boards`, `discord_sync_errors`, `pending_discord_reports`, `pending_discord_disputes`, `sub_volunteers`, `announcement_settings`, `announcement_posts`, `client_errors`, `audit_log` (append-only for everyone).

**Views / functions for stats:** `match_results_v`, `division_standings()`, `player_season_stats_v`, `season_leaderboard()`, `team_mode_records_v`, `team_maps_played_v`, `week_top_players()`, `player_breakdown()`, `free_agent_board()`, `player_directory()`, `invitable_players()`, `recruit_board()`, `live_broadcasts()`, `hall_of_champions()`, `site_counts()`, `eights_public_state()`, `audit_log_public`. Preseason is excluded from every aggregate.

**Key mechanisms:**
- Rule triggers (`*_guard`) on most tables raise P0001 (rule) / 42501 (permission). Internal writes set the `hal.internal` transaction flag.
- `compare_reports` → `apply_reports` rebuilds maps, stats and mismatches from both reports on every report change (idempotent).
- `audit_staff_change()` trigger on every league table; `audit_strip()` removes private keys.
- `notifications_outbox` + `enqueue_notification(type, payload)` is how database events reach Discord.
- `discord_sync_enqueue()` fires `pg_net` POSTs to `discord-sync` (URL/secret in Vault).
- Storage buckets: `screenshots` (private; `{matches|disputes}/{match}/{team}/file`), `team-logos` (public; logos and team banners), `season-media` (public; season banners, owner writes).
- Realtime on `matches` and `match_maps`.
- Cron jobs: `hal-discord-scheduler` (5 min), `hal-auto-confirm-reports` (15 min), `hal-expire-reschedules` (15 min), `bil-eights-tick` (15 s), `hal-prune-client-errors`.

---

## 7. Discord bot

### Architecture
- **`discord-interactions`**: receives Discord HTTP interactions, verifies the Ed25519 signature, routes slash commands by name and buttons/selects/modals by `custom_id` (`feature:action:id`). Looks up the linked profile by Discord id; unlinked users are told to log in on the site. Long work uses deferred replies finished in `EdgeRuntime.waitUntil`. Because it uses the service role, every handler re-checks permissions with service-role `*_for(user_id, …)` SQL helpers that mirror RLS (including recusal).
- **`discord-scheduler`**: runs every 5 minutes. Sends timed posts (reminders, check-in, missing check-in warnings, unreported-match alerts), creates/archives match-day channels, drains the outbox, runs auto-announcements, closes stale recruiting posts and reconciles the live boards. `bot_events` claims make every post exactly-once.
- **`discord-sync`**: idempotent role/channel sync triggered by DB triggers (`team_sync`, `team_removed`, `user_sync`), plus owner/admin actions (full resync, post guides, announcement preview/post) and 8s vote closes.
- Pure message builders and planners in `_shared/` with Deno tests; REST calls go through one client with 429 handling; embeds share a red-bar league style.

### Server layout
Info: #start-here, #rules, #announcements · League boards: #team-rosters, #standings, #match-schedule, #results, #player-of-the-week · Community: #general, #free-agents, #teams-recruiting, #sub-board, #lf-8s, #clips, #suggestions · Matches: private text + voice channel per team, Match Day / Match Archive categories, Preseason category · Support: #disputes (private threads) · Staff: #admin-only, #audit-log · Voice: Lobby, Waiting Room, Casting Stage, Admin, 8s Team A/B. Channel ids are set on Admin → Discord.

### Slash commands
| Command | What it does |
|---|---|
| `/ping`, `/link`, `/help` | Health check; link to your profile; context-aware help for the current channel |
| `/lfg post` / `/lfg remove` | Modal (role, availability, note) → free agent post on the site and an embed in #free-agents with "Invite to team" |
| `/reschedule match day time` | Autocompleted match and day (same league week), ET times 6:00–11:30 PM; posts to both team channels with Accept/Decline for the opponent |
| `/report match shot1..shot5` | Uploads screenshots, opens a modal with one "Mode \| Map \| home-away" line per map (fuzzy/abbreviation matching), saves a draft and links to the prefilled site stat grid |
| `/dispute match reason evidence` | Modal for description → dispute + private thread with both captains and non-recused admins |
| `/preseason match day time` | Proposes a preseason match time to the opponent |
| `/8s join|leave|leaderboard` | Casual pick-up queue |

### Automated features
- **Role sync:** Captain, Player, Free Agent, BIL Admin, BIL Caster and a role per team; only bot-managed roles are ever removed. Each approved team gets a private text channel (`【tag】Name` in bold Unicode so case survives) and voice channel. Players not in the server are skipped and caught up when they log in.
- **Match flow:** 24h and 1h reminders in team channels; check-in post with a button → pick 4 players; missing check-in warning (pings captains + #admin-only); a shared match-day channel opens 15 min before (both rosters pinged) and is archived read-only after settlement; results posted to #results (edited if the result changes).
- **Live boards:** one message per team (#team-rosters), per division (#standings), per week (#match-schedule), per short team per match (#sub-board, with "I'm available" / "Withdraw" volunteer buttons), and a Monday-noon Player of the Week (2+ maps, best average score). Content-hashed so they only edit when changed; reposted if deleted.
- **Invites & emergency subs:** DMs with Accept/Decline; team channel told of the outcome; emergency-sub DMs and admin posts.
- **Recruiting:** cards in #teams-recruiting with "Interested", which pings the captains.
- **Reschedules & disputes:** site actions mirrored via the outbox; dispute threads get site comments, the decision, then archive/lock.
- **Admin alerts** in #admin-only pinging BIL Admin: team ready for approval, report mismatches, disputes, missing check-ins, emergency sub ready, unreported matches after 24h, rank exceptions.
- **Announcements:** signups open, season countdown, roster changes, roster lock, playoffs; built from season settings, posted manually or automatically at 7 days / 1 day / day-of.
- **Channel guides:** pinned explainer posts (with buttons where relevant) in every bot channel and team channel.
- **Preseason:** invite with In/Out buttons in team channels, private shared channel per pairing, propose/accept times (no two preseason matches within 2 hours, so one cast at a time).
- **8s:** queue post with Join/Leave; at 8 players it shuffles 4v4, runs a 2-minute mode vote, picks a random map from that mode, pings the 8 and moves them into team voice channels; each team reports a winner (2 agreeing reports confirm; disagreement → admin fix buttons); 5 of 8 can cancel; queue spots expire after 2h; leaderboard by wins then win %.

---

## 8. Cross-cutting conventions to keep in a rebuild

- Composables per domain wrap all Supabase queries (components never import the client) and return typed refs plus `loading`/`error`.
- Database errors are translated to friendly copy in one place (`dbErrorMessage`).
- Times: `timestamptz` UTC in the DB, league math in ET via DST-safe helpers (`zonedToUtc`, `leagueWeekBounds`), shared between web and bot.
- Discord names are only visible to signed-in users; public views use Activision IDs.
- Every SECURITY DEFINER function sets `search_path = ''` and fully qualifies names. New columns on `profiles` need explicit column grants.
- Every new staff-editable table gets the audit trigger; every new admin-facing event uses the admin-ping helper; every new aggregate excludes preseason.
- Netlify CSP must list every external host (Supabase incl. wss, Discord CDN, stream embeds).
- Client errors are reported to `client_errors` (rate-limited) and shown on Admin → Health.
- Deployment order and every secret are in `docs/DEPLOY.md`; Discord paste-in text is in `docs/discord-server-text.md`.

---

## 9. Suggested build order (for the rebuild guide)

1. Monorepo, Vue/Vite/Tailwind scaffold, design tokens and UI primitives, app shell (icon rail, results ticker, phone tab bar).
2. Supabase project, core schema, permission helpers, RLS, storage, audit log.
3. Discord OAuth login, auth store, onboarding/profile (incl. rank eligibility).
4. Teams, invites, rosters, free agents board, players directory.
5. Rules page from markdown.
6. Season admin: settings, divisions, modes & maps, schedule and playoff generators.
7. Public season pages: season hub, matches, match detail, standings, leaderboards (podium, teams, Hall of Champions), team/player stats, personal dashboard, landing page.
8. Double-entry reporting, comparison, mismatches, 24-hour auto-confirm.
9. Admin panel: overview, mismatch queue, disputes, content, roles, recusal everywhere.
10. Reschedules, disputes, outbox.
11. Broadcasts, casting desk, live banner, Watch page and replays.
12. Discord bot foundation: interactions function, signature check, command registration.
13. Role/channel sync, scheduler (reminders, check-in, results), match-day channels.
14. Slash commands: /lfg, /reschedule, /report, /dispute; invite and emergency-sub DMs; admin alerts.
15. Live boards, announcements, channel guides, recruiting, sub board, Player of the Week.
16. Preseason flow and 8s (bot plus the read-only /8s page).
17. Production: Netlify, CSP, CI, monitoring, OG images, deploy docs.
