# Heaven's Arena League (HAL): project spec and conventions

Website and serverless Discord bot for Heaven's Arena League (HAL), a competitive Call of Duty: Modern Warfare 4 league.
This file is the only context future sessions get. Keep it complete and update it when a decision changes.
The step-by-step build plan is `hal-build-guide.html` (kept outside the repo); each step's prompt starts with "Read CLAUDE.md first".

## Repo layout (pnpm workspaces)
- `apps/web`: Vue 3 + TypeScript (strict, `noUncheckedIndexedAccess`) + Vite + Tailwind CSS v4 (`@tailwindcss/vite`, tokens in `@theme` in `src/assets/main.css`) + Vue Router + Pinia + `@supabase/supabase-js`.
  - `src/config/site.ts`: site config and league copy (name, Discord invite, rulebook repo). Don't hard-code copy in components.
  - `src/lib/supabase.ts`: the single Supabase client. `src/composables/`: data access. `src/stores/`: Pinia (session/user only).
  - `src/types/database.ts`: generated Supabase types.
- `supabase/`: Supabase CLI project. Migrations in `supabase/migrations`, Edge Functions in `supabase/functions` (shared code in `supabase/functions/_shared`), seed in `supabase/seed.sql`.
- `rules/rulebook.md`: the league rulebook, the source of truth for rule text, rendered by the site's Rules page.
- `scripts/`: one-off Node/TS scripts (for example, Discord slash command registration). Run with `tsx`.
- `.env.example` (root: scripts, CLI, Discord secrets) and `apps/web/.env.example` (browser-safe `VITE_*` values). No real secrets in git.

## Infrastructure
- Supabase project: "Heaven's Arena League", ref `lluwzpwiybvgnsimpwey`, region us-west-2, URL `https://lluwzpwiybvgnsimpwey.supabase.co`.
  Schema work goes through the Supabase MCP (`apply_migration`, `generate_typescript_types`, `get_advisors`) or the CLI. Keep each local migration file's version prefix equal to the version in the remote migration history.
- Hosting: Netlify (SPA). GitHub repo: `Jxk0be/HAL` (public, so rulebook history is visible).
- Discord server invite: `VITE_DISCORD_INVITE_URL` = https://discord.gg/G3WjuvFak8 (set to never expire).

## League
- Name: Heaven's Arena League (HAL). Look: serious and clean. Dark theme, gold accent (`#D4AF37`), simple wordmark.
- Game: Call of Duty: Modern Warfare 4. CDL ruleset and Gentlemen's Agreements (GAs). Modes, maps and GAs are admin-editable data (the owner supplies them later). Never hard-code them.
- Region: NA only. League times are defined in America/New_York and shown in each viewer's local time.
- Entry: free. Prize: $200 to the champion ($50 per starter), paid by PayPal or Venmo within 7 days of the final.

## Season format
- Up to 16 teams in one division. If more than 16 sign up, split into Premier and Contender. The data model must support multiple divisions per season.
- Preseason (2 weeks), then an 8-week regular season with 2 matches per week, then playoffs (top 8, 2 weeks), then offseason.
- Default match nights: Tuesday and Thursday at 9:00 PM America/New_York (8 PM Central). Store these as season settings, not constants.
- Series are best-of-5. Higher seed picks first; picks alternate.
- Reschedules: both captains must agree through the site or bot at least 24 hours before the default time. The new time must be in the same week, by Sunday 11:59 PM ET. No agreement means the default time stands.

## Eligibility, rosters, subs
- 18+ (age confirmed at signup). Controller only on every platform. PC is allowed with a controller.
- PC players keep a POV recording for 72 hours; admins may ask for a live screen-share.
- Login is Discord OAuth only. Players add their Activision ID to their profile.
- One team per player per season. Roster: up to 4 starters (the captain is one of them) and 3 subs, so max 7. One captain, one optional co-captain.
- Joining a team: everyone who signs in with Discord is automatically a free agent. A captain invites a free agent, either by searching their name on the team page or with Invite on the Free Agents page, and only while the team has an open spot. The player accepts or declines (on the site, later also in Discord). Accepting puts them on the roster immediately with no admin approval, takes them off the free agent list and cancels their other invites. Invites expire after 7 days.
- Leaving a team: captains remove players, and players can leave on their own (the captain transfers the captaincy first). Either way the player goes back on the free agent list.
- 3 roster changes (adds or drops) per team per season. Rosters lock about 2 weeks before playoffs (season setting). Playoff eligibility requires 2+ regular-season matches played.
- Subs must be on the roster 24 hours before a match. Swaps only between maps.
- Emergency sub: if a team has fewer than 4 eligible players, an admin can approve one free agent for one match only.
- A dropped player can't join another team in the same division for 7 days.

## Match day
- Bot reminders at 24h and 1h before each match, in the team's private channel.
- Check-in opens 15 minutes before the match. The captain selects exactly 4 players from the roster plus approved subs. Admins can audit check-ins.
- 15 minutes late = map forfeit; 30 minutes late = series forfeit.
- Disconnect in the first 30 seconds or before the first kill = map restart. Otherwise play continues; one tactical pause of up to 5 minutes per team per series.
- 2 forfeits in a season = team removed and its remaining matches recorded as losses.

## Reporting and stats (double entry)
- Recorded: series map count and winner; per map: mode, map, final score, winner, screenshot; per player per map: kills, deaths, score.
- The site calculates K/D, +/-, average score per map, maps played, map and series win %, and team records by mode.
- Both captains submit the full scoreboard (all 8 players, every map) with screenshots.
- A series result is confirmed when both captains' series and map scores agree; standings update then.
- Stats are compared field by field. Matching values are confirmed. Differing values create mismatch rows for the admin queue, where an admin picks the value after checking the screenshots.
- If one captain hasn't submitted 24 hours after the match, the other captain's submission stands, as long as it has screenshots.

## Integrity
- Cheat devices (Cronus, XIM, strike packs): team banned for the season, player banned permanently. Conduct violations: suspension or ban. Exploits: map loss. Admins may request VODs.
- Disputes are opened by a captain within 24 hours, with evidence. Admin decisions are final.
- The owner's team plays in HAL. Staff can NEVER take staff actions on a match involving a team they are rostered on. Enforce this in Postgres (RLS and functions), not just the UI.
- Public audit log: every staff write records actor, action, table, row, old value, new value and time. Anyone can view it. Private fields (emails, Discord IDs, dispute evidence) are never exposed.

## Roles
- Owner: everything (seasons, settings, roles, payouts, all admin actions), except actions on their own team's matches.
- Admin: mismatches, disputes, roster approvals, add/edit/remove matches, results, teams and free agent posts, penalties. Not roles or seasons.
- Caster: mark a match as broadcast and paste their stream link (shows a live banner). Nothing else.
- Captain: manage own team, check in, report, reschedule, open disputes.
- Player: profile, free agent post, join team.

## Website pages
- Public:
  - Home: next matches, latest results, live broadcast banner.
  - Standings: table plus stat leaderboards.
  - Players: list plus profiles. Teams: list plus pages. Free Agents.
  - Matches: schedule plus results, with week and team filters and the broadcast link.
  - Rules: a designed page rendered from `rules/rulebook.md` on GitHub, with a sticky TOC, numbered rules, linkable anchors like `/rules#4.2`, callouts, search, and the last-updated date plus a history link. It must look like a real designed page, not raw markdown.
  - Audit Log. Login.
- Logged in: My Profile. Captain: Create/Manage Team, Report Match, Reschedule Requests.
- Admin: Mismatch Queue, Disputes, Roster Approvals, Season/Schedule Setup, Content Management (add/edit/remove any match, result, team, free agent post), User Roles (owner only).

## Discord
- Separate HAL server. Channels:
  - Info: #announcements, #rules, #schedule, #results, #audit-log
  - Community: #general, #lfg-free-agents, #clips, #suggestions
  - Matches: one private channel per team, created and removed by the bot
  - Support: bot-created private dispute threads, #admin-only
  - Voice
- The bot is serverless: Discord HTTP interactions (slash commands, buttons, select menus, modals) are served by a Supabase Edge Function, the Discord REST API handles outbound actions, and pg_cron runs scheduled jobs. No gateway process.
- Launch features: reminders, check-in, results announcements, role sync (team, captain, free agent and staff roles plus team channels).
- In-season features: `/lfg`, `/reschedule`, `/report` (series and map scores plus screenshots in Discord, then a button opens the site's prefilled stat grid), `/dispute` (private thread with both captains and admins).
- Discord modals hold at most 5 inputs, so the 8-player stat grid lives on the site.

## Conventions
- Vue: Composition API with `<script setup lang="ts">` only. Type props/emits with `defineProps<...>()` / `defineEmits<...>()`. Small composables per domain (`useTeams`, `useMatches`, and so on) that wrap Supabase queries and return typed refs plus `loading`/`error`. Components never import `supabase` directly. Pinia only for session and user state.
- No `any` unless justified in a comment.
- Styling: Tailwind only, using tokens from `@theme` (`bg-bg`, `bg-surface`, `text-muted`, `text-gold`, `bg-gold text-on-gold`, ...). No component libraries; build shared primitives in `src/components/ui`.
- Supabase types are generated to `apps/web/src/types/database.ts` (`pnpm db:types` or the MCP `generate_typescript_types`). Regenerate after every migration.
- Times: `timestamptz` in UTC in the database; league scheduling math in America/New_York; display in the viewer's local time with the ET time on hover.
- Every permission is enforced in Postgres RLS or SECURITY DEFINER functions. UI checks are only for convenience. RLS is enabled on every table.
- SECURITY DEFINER functions always `set search_path = ''` and fully qualify names.
- Every staff write goes through the audit log.
- Migrations are additive and named with timestamps (`supabase/migrations/<version>_<name>.sql`). Never edit an applied migration. Run the Supabase security advisors after DDL changes.
- Edge Functions are Deno TypeScript. Shared code lives in `supabase/functions/_shared`.
- Accessible, responsive UI: labels on inputs, visible focus states, keyboard-friendly modals. Mobile matters (players check schedules on phones); every page must work at 375px wide.
- `localStorage`/`sessionStorage` access is always wrapped in try/catch.

## Database (as built)
- Permission helpers (SECURITY DEFINER, signed-in only; anon can't execute them): `is_owner()`, `is_admin()` (owner or admin), `is_caster()`, `has_role(role)`, `my_team_ids(season)`, `is_captain_of(team)` (captain or co-captain), `is_on_team(team)`, `is_captain_in_match(match, team)`, `match_captain_team(match)`, `is_party_to_match(match)`.
- **Recusal:** every staff write on a match or its children uses `can_staff_match(match_id)` (= `is_admin() and not is_party_to_match`); staff writes on teams/rosters use `can_staff_team(team_id)`. This applies to the owner too.
- Policies on anon-readable tables must not call the helpers (anon has no EXECUTE): give anon its own `using (true)` / plain-column policy.
- Rule triggers (`*_guard`) raise clear errors (errcode P0001 for rule breaks, 42501 for permission). They let the service role through (`auth.uid()` null) and our own functions set the transaction flag `hal.internal` for internal writes (`public.is_internal()`).
- Rosters: the team creator becomes captain and first starter automatically. Nobody inserts `team_members` directly except staff; players join through `team_invites` using the RPCs `invite_player(team, user, role?)`, `respond_to_invite(invite, accept)` and `cancel_invite(invite)`. Players leave through `remove_player(team, user)` (captains/staff) or `leave_team(team)`. `team_open_spots(team)` returns `{open, starters_open, subs_open}` for showing or hiding Invite buttons. Role caps are season settings (`max_starters` 4, `max_subs` 3, `max_roster` 7). An invite with no role becomes a starter if a starter spot is open, otherwise a sub. Accepting needs a complete profile (Activision ID plus age confirmation). Captains can update a member's starter/sub role directly, within the caps. `roster_requests` is now only for emergency subs (admin-approved). Roster changes count only while the season is `regular` or `playoffs`.
- Free agents: `profiles.is_free_agent` defaults to true and a trigger keeps it in sync with roster membership. The public list is the `free_agents` view (profile plus optional `free_agent_posts` details, banned players excluded). Captains search it by name (`discord_username`/`activision_id`).
- Disputes: evidence lives in `dispute_evidence` (parties + staff only); the public reads `disputes`/`disputes_public` without it.
- Private columns are hidden with column privileges, so `select('*')` fails on `profiles` (no `discord_id`) and `disputes` (no `discord_thread_id`). Select explicit columns or use `profiles_public` / `disputes_public`.
- Casters change matches only through `set_broadcast(match_id, live, url)` (audited, https only).
- Storage: `screenshots` (private) paths are `{matches|disputes}/{match_id}/{team_id}/<file>`; `team-logos` (public) paths are `{team_id}/<file>`.
- Tests: `supabase/tests/rules_test.sql` runs in one rolled-back block and must end with `ALL TESTS PASSED`. Run it (MCP `execute_sql` or the SQL editor) after changing rules or policies.

## Commands
```
pnpm install
pnpm dev          # web app at http://localhost:5174
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm db:types     # regenerate Supabase types (needs `supabase login`)
```
After each task: run typecheck and lint, and list what to test manually.
