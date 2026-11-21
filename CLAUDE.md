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
- Name: Heaven's Arena League (HAL). Look: serious and clean. Dark theme, gold accent (`#F8B800`, taken from the logo), winged "HAL" logo.
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
- Admins may ask a PC player for a live screen-share. (There is no POV-recording pledge; it was removed.)
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

## Web app (as built)
- Look: near-black surfaces, warm off-white text, one gold accent; green and red (`win`/`loss`) only for results and status. Headings use the display face (`font-heading`, Barlow Condensed, uppercase); body uses Inter (both self-hosted via Fontsource). Use `tnum` on every score or stat, and `eyebrow` for small tracked-caps labels.
- Tokens live in `@theme` in `apps/web/src/assets/main.css`: `bg`, `surface`/`surface-2`/`surface-3`, `line`/`line-strong`, `text`/`muted`/`faint`, `gold`/`gold-strong`/`gold-dim`/`gold-soft`/`on-gold`, `win`/`loss` (+ `-soft`), `live`. Solid gold fills always pair with `text-on-gold`.
- Primitives in `src/components/ui`, all `Ui*`-prefixed except the domain ones: UiButton (`to` for routes, `href` for external links, which open in a new tab), UiCard, UiBadge, UiTable (`#cell-<key>` slots, `v-model:sort`), UiTabs, UiSelect, UiInput, UiModal (native `<dialog>`, v-model), UiToastHost plus the `useToast()` composable, UiEmptyState, UiSkeleton, UiAvatar, TeamLogo, ScoreChip, UiCountdown. Shared types are in `ui/types.ts`. The brand mark is `components/brand/HalWordmark.vue` and never animates.
- Logo: `HalWordmark.vue` renders `src/assets/brand/hal-logo.webp` (960w) or `hal-logo-sm.webp` (240w) by `size` (height in px); pass `decorative` when the league name is also given as text. The artwork already contains the league name. Favicon, app icons and `public/og.png` are generated from the same transparent artwork (logo centred on `#0b0b0d`); regenerate them all if the logo changes. Gold tokens: `gold` #F8B800, `gold-strong` #FFD23F, `gold-dim` #9A7300. Discord embeds/roles use the same values (`HAL_GOLD` in `_shared/embeds.ts`, `FIXED_ROLE_SPECS` in `discord-sync/plan.ts`).
- Layout: `App.vue` renders a skip link, LiveBanner (fed in step 17), AppHeader (desktop nav, UserMenu, mobile `<dialog>` drawer), `<main id="main">`, AppFooter and UiToastHost. Pages start with `PageHeader`. Nav items are `mainNav` in `src/config/site.ts`; home copy is in `src/content/home.ts`.
- Routing: every page is a lazy route in `src/router/index.ts`. Unbuilt pages use `PlaceholderView`, which reads `meta.title/eyebrow/description/buildStep`. `meta.requiresAuth` sends logged-out users to `/login?redirect=`; `meta.staff` is `'any' | 'admin' | 'owner'`, checked against the auth store. `/dev/ui` (the style guide) exists only in dev builds.
- Auth: `useAuthStore` (`src/stores/auth.ts`) holds the session, `profile` (selected with `PROFILE_COLUMNS`, never `*`), staff roles, the current-season `team` (role, captain or co-captain), `isOnboarded`, `isBanned`/`bannedUntil` and `isStaff`/`isAdmin`/`isOwner`. Call `refresh()` after anything that changes them. Login is Discord OAuth with PKCE and scopes `identify email` (Supabase needs the email to create the user; it is never shown). It returns to `/auth/callback?next=…`, which sends incomplete profiles to `/onboarding?next=…`. Redirect targets always go through `safeNext()` (same-site paths only).
- Onboarding: `ProfileForm` (used by `/onboarding` and `/profile`) needs an Activision ID (`Name#1234567`, unique ignoring case), a platform, and the 18+ and controller confirmations. That's the same for every platform; there is no POV pledge. Confirmations are set once and stamped by the server. The rules live in `src/lib/validation/profile.ts`, which mirrors `public.is_profile_complete()`; the database refuses team creation and invite acceptance until the profile is complete. Profile saves go through `useMyProfile()`.
- Route meta `player: true` (My Team, Report, Reschedules) needs a complete profile and no active ban. `AccountNotice` shows a site-wide banned or "finish your profile" bar.
- Owner bootstrap: run `supabase/snippets/make_owner.sql` once after your first login.
- Teams (step 6):
  - Teams can only be created while the season is in `signups` (staff are exempt), and only by players with a complete profile.
  - Only the captain picks the co-captain. `transfer_captaincy(team, user)` hands the team to another rostered player; the old captain stays on the roster and can then leave.
  - Logos go to the `team-logos` bucket at `{team_id}/logo-<timestamp>.<ext>` (PNG, JPG or WebP, 1 MB max), with the public URL stored in `teams.logo_url`.
  - Data access lives in `useActiveSeason`, `useTeamList`/`useTeam` (roster mapped to `RosterPlayer`), `useTeamActions` (every captain/player action, errors translated by `dbErrorMessage` in `src/lib/errors.ts`), `useMyInvites`/`useTeamInvites` and `useFreeAgentSearch`. That last one strips PostgREST/LIKE metacharacters before building the `or()` filter.
  - `RosterList` is a table from 640px up and cards below. `/my-team` is create-or-manage, `/teams` and `/teams/:id` are public, and pending invites sit on `/profile` (`InvitesCard`).
  - Adds and drops never need admin approval (the owner's decision). In `regular` and `playoffs` they count toward `max_roster_changes`. Check-in eligibility uses `team_members.joined_at`, which is the moment the invite was accepted.
- Tests: `supabase/tests/team_management_test.sql` (captaincy, co-captain, signups-only creation) runs like `rules_test.sql`.
- Discord names are for signed-in users only (step 7):
  - Anon has no SELECT on `profiles.discord_username`, and the `profiles_public`/`free_agents` views don't include it.
  - Never select or embed `discord_username` in a query that can run logged out. `useTeam` switches between two selects on `auth.isSignedIn`.
  - Show names with `playerName()` (`src/lib/players.ts`): the Discord name when present, otherwise the Activision ID.
  - The public audit feed still names the staff member who acted; that's intended.
- Free Agents board and Players directory:
  - Both are SECURITY DEFINER functions with filtering and paging (30 per page, max 60): `free_agent_board(search, platform, role, limit, offset)` and `player_directory(search, player_id, limit, offset)`, each with `total_count` on every row.
  - Both return `discord_username` only to signed-in callers, and only signed-in callers can search by it. Search input goes through `like_pattern()`, so wildcards are escaped.
  - The board lists free agents with a complete profile who aren't banned, posts first. Use `useFreeAgentBoard`, `usePlayerDirectory` and `usePlayer` in `useDirectory.ts`.
- Free agent posts:
  - `preferred_role` is one of `AR`, `SMG`, `Flex`. Posting needs a complete profile and no team, and lists you as a free agent (`free_agent_posts_guard`).
  - Joining a team deactivates your post. Staff can take down or delete any post (audited).
  - Use `useMyFreeAgentPost`, `useFreeAgentModeration` and `useOpenSpots`. Captains see "Invite to team" on board cards while `team_open_spots` reports an open spot.
- Rules page (`/rules`, step 9):
  - `useRulebook()` loads `rules/rulebook.md` from raw.githubusercontent.com, caches it in sessionStorage for 10 minutes, and falls back to the copy bundled at build time (`?raw` import). The "last updated" date comes from the GitHub commits API, falling back to `__RULEBOOK_COMMIT__`, which `vite.config.ts` reads from git at build time.
  - While the repo is private, visitors get the bundled copy and the history link 404s.
  - `parseRulebook()` (`src/lib/rulebook.ts`) turns the markdown into sections, rules (`**N.N**`), callouts (`> [!IMPORTANT]`/`> [!NOTE]`), and lists attached to the rule before them. Only inline fragments become HTML, sanitised with DOMPurify (strong, em, a, code, br, s).
  - Keep the rulebook in that format; the parser test checks the real file has 15 sections and rule 4.2.
  - Anchors: sections are `/rules#4`, rules are `/rules#4.2`. Those ids aren't valid CSS selectors, so the router skips hash scrolling for `rules` and `RulesView` scrolls with `getElementById`. Use `CSS.escape` for any other hash.
  - Print: `print:hidden` on site chrome, plus a print block in `main.css`.
  - The production CSP (deploy step) must allow `raw.githubusercontent.com` and `api.github.com` in `connect-src`.
- Discord bot (step 10):
  - The `discord-interactions` Edge Function is deployed with `verify_jwt: false`; the Ed25519 signature check is the authentication. Secrets: `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID`, `SITE_URL`.
  - `_shared/interactions.ts` is a pure router. Handlers live in `discord-interactions/handlers.ts`: commands by name, components and modals by the first part of `custom_id` (`feature:action:id`).
  - Handlers return a `Reply`. Use `{ kind: 'deferred', work }` for anything that might take more than about 2 seconds; the router answers with type 5 (commands, modals) or type 6 (components) and edits the original reply in `EdgeRuntime.waitUntil`. Mentions are off unless a payload sets `allowed_mentions`.
  - Handlers get the linked HAL `profile` (looked up by `profiles.discord_id`). Unlinked users get a "log in on the site" reply unless the handler is `public`.
  - The service-role client bypasses RLS, so re-check every permission with `permissionsFor(db, userId)` (`_shared/permissions.ts`). It calls the service-role-only `*_for(user_id, …)` SQL helpers, which mirror the RLS helpers, including recusal via `can_staff_match_for`.
  - Discord REST calls go through `_shared/discord.ts`, which retries on 429. Embeds use `halEmbed()` (gold bar, HAL footer).
  - Slash commands are defined only in `_shared/commands.ts`. Register them with `pnpm commands:register`. Deno tests run with `pnpm test:functions`.
  - Deploying with the Supabase MCP: pass the entrypoint plus every `../_shared/*.ts` it imports as files.
- Discord role sync (step 11):
  - Postgres triggers on `teams`, `team_members`, `staff_roles` and `profiles` call `discord_sync_enqueue(action, payload)`, which fires a pg_net POST to the `discord-sync` Edge Function.
    - Actions: `team_sync`, `team_removed`, `user_sync`.
    - The URL and shared secret live in Vault (`discord_sync_url`, `discord_sync_secret`), created once per environment by `supabase/snippets/setup_discord_sync.sql`. Without them the triggers do nothing.
    - The function reads the secret through the service-role-only `discord_sync_secret()`.
  - The function recomputes the desired state each time, so every call is idempotent.
    - `plan.ts` holds the pure rules: `desiredRoles`, `roleDiff` (only removes HAL-managed roles), and team channel names and permissions. `sync.ts` does the I/O.
    - Team channel names are `【tag】Name` in mathematical sans-serif bold (`boldText`), e.g. 【𝘁𝗩】𝗧𝗲𝗮𝗺-𝗩𝗲𝗰𝘁𝗼𝗿𝗶𝘇𝗲, because Discord lowercases ASCII, turns spaces into dashes and strips [ ]. Tested on the live server.
    - Discord allows only 2 renames per channel per 10 minutes: the sync sends a name only when it changed, and `discordRequest` throws on any 429 longer than 10s instead of sleeping (logged to `discord_sync_errors`; the next sync retries).
    - Team tags keep the capitals the captain types (`tV`); the database allows 2–5 letters or digits in any case.
    - Fixed roles (Captain, Player, Free Agent, HAL Admin, HAL Caster) and the "Team Channels" category are created on first use (matched by name if they already exist), with their ids stored in `app_settings.discord`.
    - Team role and channel ids are stored on `teams`. Team channels are visible only to the team role, HAL Admin and the bot.
  - Who gets which role:
    - Players not in the server are skipped (counted as `notInServer`). `auth.refresh()` calls `request_my_discord_sync()` (throttled to 10 minutes) so they catch up after joining.
    - Free Agent needs a complete profile and no ban.
  - `full_resync` is only for the owner, called with their JWT from `/admin/discord`, which also shows the latest 20 rows of `discord_sync_errors`.
  - The function is deployed with `verify_jwt: false` and authenticates in code (secret header, or owner JWT for `full_resync`).
  - The audit trigger ignores changes that only touch Discord ids or `discord_synced_at`.
  - pg_net is installed in the `extensions` schema; call it as `net.http_post`.
- Season admin (step 12):
  - `/admin/season` has six tabs: Season (only the owner can edit), Team approvals (deny sets `status = removed` plus a `review_note` shown on the captain's My Team page), Divisions (owner), Modes & maps (admins: add a mode, select it, then add its maps; a map name in several modes is one `maps` row linked through `map_modes`, and removing it only unlinks it from that mode), Schedule and Playoffs (admins).
  - Data hooks: `useSeasonAdmin`, `useGameData`, `useSeasonMatches`. Team and match edits that return 0 rows mean the editor is recused, and the hooks report that.
  - Time maths lives in `src/lib/time.ts`: `zonedToUtc` (DST-safe via Intl), `toZoned`, `formatLeagueTime` ("Tue, Jan 12 · 9:00 PM ET"). Don't hand-roll offsets elsewhere.
  - Schedule generator (`src/lib/schedule.ts`): circle-method round robin over weeks × nights rounds. Later cycles rotate, home/away is balanced greedily, odd team counts get byes, and a seeded shuffle drives Regenerate. `playoffPairs` / `bracketOrder` produce 1v8, 4v5, 2v7, 3v6.
  - Standings (`src/lib/standings.ts`) follow rulebook 5.5: series wins, map differential, head-to-head, deciding-map round differential, then teams flagged for an admin decision.
  - Matches are saved only through the `create_matches(season, matches jsonb, replace)` RPC (admin only, one transaction). Replace refuses once any match in that division/stage/round has started.
  - Bulk generation isn't recused (it's league-wide); editing a single match is.
  - Week 1 starts on the Monday of `seasons.starts_on`. Playoff matches use week `regular_weeks + round`.
- Public season pages (step 13):
  - Stat maths lives in Postgres:
    - `match_results_v` has one row per team per counted match. Confirmed and forfeit only, and a forfeit is a 3–0 loss.
    - `division_standings(season, division?)` is security invoker and sorts by rule 5.5: series wins, map diff, head-to-head among tied teams, deciding-map round diff, then `needs_admin_decision`. It returns `last5` newest first.
    - `player_season_stats_v` covers confirmed values only. `qualifies` = played at least 40% of the team's maps; it carries Activision IDs, never Discord names.
    - `team_mode_records_v` and `team_maps_played_v`.
  - Realtime: `matches` and `match_maps` are in the `supabase_realtime` publication. `useRealtime(name, tables, cb)` debounces reloads.
  - Data hooks: `useSeasonSchedule` (the whole season's matches, filtered client-side), `useMatchDetail`, `useStandings`, `useLeaderboards`, `useTeamRecord`, `useTeamModeRecords`, `usePlayerStats`, `useAuditLog`, `useDivisions`.
  - Times: show them with `LeagueTime` (the viewer's local time, with Eastern on hover).
  - Match detail: screenshots come from `report_submissions` as one-hour signed URLs. RLS shows each team only its own until the match is settled, then both teams; staff always. Check-ins are visible to the teams and staff only.
  - Tests: `supabase/tests/stats_test.sql` and `supabase/tests/schedule_test.sql`.
- Match reporting (step 14):
  - Form at `/report/:matchId` (`ReportMatchView`, the old `/my-team/report/:id` redirects there). Discord's `/report` (step 21) links with `?prefill=<report_submissions id>`. Captains and co-captains of either team only, from the scheduled time until the match is settled.
  - Form logic is pure and tested in `src/lib/reporting.ts` (`seriesState`, `mapsNeeded`, `validateReport`, `toPayload`, `fromSubmission`, `parsePastedRow`, `describeMismatch`). Data and uploads go through `useReport()` / `useReportStatus()`. `StatGrid` is the keyboard-first stat table: Enter = next cell, arrows move, pasting a spreadsheet row (or several) fills across and down.
  - Screenshots are compressed in the browser (`compressImage` in `src/lib/image.ts`, max 1920px, WebP) and stored at `screenshots/matches/{match}/{team}/map{n}-<id>.webp`. Drafts autosave to localStorage per match and team (`hal:report-draft:…`) until the first submit.
  - Submit only through the `submit_report(match, report jsonb, source)` RPC. It re-checks everything: captain, match time, 3–5 maps, first to 3 with nothing after the decider, no ties, map legal for the mode, at least one uploaded screenshot per map in the team's own folder, and 4 rostered players per team per map. Captains have no direct insert/update on `report_submissions` (staff can update, recused).
  - Every report insert, update or delete triggers `compare_reports(match)`, which calls `apply_reports(match, home, away, source)`. That rebuilds `match_maps`, `player_map_stats` and `stat_mismatches` from scratch, so it is idempotent. Map differences (played/mode/map/scores) set the match `disputed`. Player-stat differences only mark that map's `stats_status = mismatch` (one `stat_mismatches` row per differing field), and the result is still confirmed. These derived writes skip the audit log (`hal.no_audit`).
  - Captains never see the opponent's report, screenshots or mismatch values before the match is settled. `stat_mismatches` is staff-only (recused); parties call `my_match_report_status(match)` for which side reported and which fields differ.
  - 24-hour rule: pg_cron job `hal-auto-confirm-reports` (every 15 min) runs `auto_confirm_reports()`. It accepts a lone report that has screenshots for every map once the match is 24h past `scheduled_at`, sets `matches.result_source = 'single_report'` and writes one 'system' audit entry. `result_source` is `double_entry | single_report | admin | forfeit`.
  - Tests: `supabase/tests/reporting_test.sql` (25 checks: validation, identical reports, one kill different, map mismatch then correction, privacy, 24-hour rule).
- Admin panel (step 15):
  - `/admin` is one shell (`AdminLayout`: sidebar on desktop, scrolling tabs on phones) with child routes: Overview, Mismatch queue (+ `/admin/mismatches/:matchId`), Disputes, Roster approvals, Content (tabs: matches and results, teams, free agent posts, players and bans), Season, Discord, User roles (owner).
  - Recusal everywhere: `useRecusal().isRecused(...teamIds)` greys items out and swaps actions for `RecusedNotice`. Every RPC re-checks `can_staff_match` / `can_staff_team` and raises 42501 "Recused: …". Every editing form shows `PublicLogNotice`.
  - RPCs: `admin_overview()`; `admin_mismatch_queue()` (includes recused matches, flagged, no values); `resolve_mismatch(id, 'home'|'away'|'custom', value)`; `admin_set_result(match, maps)` (overturn: keeps stats on kept maps, settles open map mismatches); `admin_clear_result(match)` (wipes maps, stats and both reports); `admin_forfeit(match, team)` (keeps `teams.forfeit_count` right); `ban_player(user, until | null, reason)` (writes a public `penalties` row).
  - Settling: `apply_map_resolutions(map)` rebuilds a map from both reports plus resolved values (mode/map resolve by name; "not reported"/"not listed" drop the map or the line). Settling the last mismatch on a disputed match with no open dispute confirms it (`result_source = 'admin'`) if the maps add up to a finished series; otherwise it stays disputed and the admin uses Set result. Mismatch page keys: 1 home, 2 away, E enter, N next.
  - `staff_roles_guard`: the last owner can't be removed. Data access for all of this lives in `src/composables/useAdmin.ts`.
  - Deleting a team: `admin_delete_team(team)` (admins not on the team). Every active player, captain included, leaves and becomes a free agent. No matches → the row is deleted (children cascade; `is_free_agent` is set by the RPC because the sync trigger doesn't fire on delete). Has matches → `status = 'removed'` with the roster emptied, so opponents' results and standings stay. It sets `hal.team_delete`, which lets `team_members_guard` drop the captain and skip roster lock/change limits; leaving a removed team doesn't start the 7-day same-division wait. Discord cleanup comes from the existing team/user sync triggers. Tests: `supabase/tests/delete_team_test.sql`.
  - Public audit log filters by table and by actor name ("bot" = system entries).
  - Tests: `supabase/tests/admin_test.sql` (17 checks).
- Reschedules and disputes (step 16):
  - Reschedules go through `request_reschedule(match, proposed_at)`, `respond_reschedule(request, accept)` and `cancel_reschedule(request)`. `reschedule_requests_guard` holds the rules: at least 24h before `default_at`, same league week (Monday to Sunday 11:59 PM in the season time zone), in the future, one pending per match. Accepting moves `scheduled_at` only. pg_cron `hal-expire-reschedules` (every 15 min) expires pending requests 24h before the default time. The client mirror is `rescheduleProblem()` in `src/lib/reschedule.ts`; week maths is `leagueWeekBounds()` in `src/lib/time.ts`.
  - UI: `RescheduleCard` on the match page (picker in the viewer's time zone, Eastern shown alongside) and the Requests panel (`TeamRequestsPanel`) on My Team.
  - Disputes open only through `open_dispute(match, category, description, evidence)` (direct inserts are revoked). Captains of either team can open one from the match time until 24h after it, or after confirmation if later; one open dispute per match. Categories: score, stats, conduct, cheating, eligibility, other. Evidence images go to `screenshots/disputes/{match}/{team}/`; links must be https.
  - Opening sets the match to `disputed` and records `disputes.match_status_before`. Resolving restores that status unless staff changed the result meanwhile; reopening sets `disputed` again. While a dispute is open, reports can't be submitted and mismatches don't auto-confirm.
  - `dispute_comments` (parties and staff read; write through `add_dispute_comment`, captains of either team and non-recused staff, open disputes only). UI: `DisputePanel` on the match page.
  - `notifications_outbox` (service role only; no policies on purpose): `reschedule_requested|accepted|declined|cancelled|expired`, `dispute_opened|comment|resolved|reopened`. Steps 18, 20 and 22 send these to Discord. Queue new events with `public.enqueue_notification(type, payload)`.
  - Tests: `supabase/tests/reschedule_dispute_test.sql` (22 checks) and `src/lib/__tests__/reschedule.spec.ts`.
- Broadcasts (step 17):
  - HAL has no stream of its own. Casters (and admins) use the casting desk at `/admin/casting`: claim a match (`claim_broadcast(match, claim)` sets `broadcast_by`), go live with a link (`set_broadcast(match, true, url)`), end it (`set_broadcast(match, false)` keeps `broadcast_url` as the VOD link). Links must be https on Twitch, YouTube or Kick (`public.is_stream_url`, mirrored by `isStreamUrl` in `src/lib/broadcast.ts`). Another caster's claimed or live match can only be taken over by an admin. Recusal applies; casters can't change anything else (tested).
  - `live_broadcasts()` (public, includes the caster's name) feeds `useLiveBroadcasts()`: one shared list and one realtime channel for the whole app. Consumers: `LiveBanner` in `App.vue` (rotates every 6s with a counter, pauses on hover/focus or with its pause button), the home page "Live now" strip, match cards ("LIVE · Watch", then "Watch broadcast"), and the match page. `broadcast_casters(match_ids)` gives caster names for claimed or past broadcasts.
  - Outbox events: `broadcast_live` (with url and caster_id) and `broadcast_ended`.
  - Tests: `supabase/tests/broadcast_test.sql` (16 checks) and `src/lib/__tests__/broadcast.spec.ts`.
- Bot scheduler, check-in and results (step 18):
  - `discord-scheduler` (Edge Function, verify_jwt off, header `x-hal-sync-secret` = the discord-sync Vault secret) runs every 5 minutes via pg_cron `hal-discord-scheduler` → `discord_scheduler_tick()` (URL derived from Vault `discord_sync_url`). Timing rules are pure in `discord-scheduler/plan.ts` (`dueKinds`): 24h reminder (T-24h to T-1h), 1h reminder, check-in post with button (T-15m to T+30m, until the team checks in), missing check-in warning at the start (tags the team's captain and co-captain, plus one post to #admin-only).
  - `bot_events (match_id, team_id, kind)` is unique per post and claimed before sending (released if Discord refuses), so overlapping runs never double-post. Service role only.
  - The scheduler drains `notifications_outbox` only for the types it handles (`match_result`, `broadcast_live`, `reschedule_*`, `checked_in`, `dispute_opened`); other types stay queued for later steps. Failures retry up to 5 times; errors go to `discord_sync_errors` as `scheduler:<kind>` (shown on Admin → Discord).
  - Results: the `matches_result_notify` trigger queues `match_result` when a match becomes confirmed/forfeit or its series changes. The post goes to #results; a changed result edits the original message.
  - Message builders are pure in `_shared/match_messages.ts` (tested in `discord-scheduler/plan_test.ts`); shared reads in `_shared/match_data.ts`.
  - Check-in: `check_in_as(user, match, players, source)` (service role; the bot) and `check_in(match, players)` (site) enforce captain/co-captain, the T-15m to T+30m window, exactly 4 players and eligibility via `eligible_checkin_players(match, team)` (rostered 24h before the match or an approved emergency sub, not banned). Checking in sets the match to `checkin_open`. Direct inserts into `checkins` are closed. Discord: button `checkin:open:<match>` → ephemeral 4-of-N select `checkin:pick:<match>` (`discord-interactions/checkin.ts`). Site: `CheckInCard` on the match page.
  - Channel IDs for #results, #announcements and #admin-only live in `app_settings.discord_channels` (owner form on /admin/discord). Team posts use each team's channel.
  - Deploy functions with the CLI from the repo root (the owner approved `--yes`): `npx supabase functions deploy discord-interactions discord-scheduler discord-sync --no-verify-jwt --project-ref lluwzpwiybvgnsimpwey --use-api --yes`. Redeploy every function that imports a changed `_shared` file.
  - Tests: `supabase/tests/checkin_test.sql` (15 checks).
- /lfg (step 19):
  - `/lfg post` checks the profile is complete and the player has no team, then opens a modal (role AR/SMG/Flex, availability, note; prefilled when editing). Submitting calls `lfg_upsert_as(user, role, availability, note)` (same `free_agent_posts` row the site uses; platform from the profile; a new post once per 24h, edits any time) and `publishLfg()` posts or edits the embed in #lfg-free-agents (channel from `app_settings.discord_channels.lfg`) and stores `discord_channel_id`/`discord_message_id`. `/lfg remove` → `lfg_remove_as` and deletes the message.
  - Each post has "Invite to team" (`lfg:invite:<userId>`): `captain_team_for(presser)` then `invite_player_as(actor, team, user)`, the shared core that the site's `invite_player` now wraps. The player gets a DM linking to /profile; if DMs are closed, the captain gets the link to send by hand (ephemeral).
  - Site changes reach Discord through the outbox: the `free_agent_posts_notify` trigger queues `lfg_changed` (edit, deactivate, joining a team) or `lfg_deleted` for posts that have a Discord message; the scheduler edits or deletes it. Code: `_shared/lfg_messages.ts` (pure, tested), `_shared/lfg_sync.ts`, `discord-interactions/lfg.ts`.
  - Router: a deferred reply with `newMessage: true` answers a button with a new (ephemeral) message instead of editing the message the button is on.
  - Tests: `supabase/tests/lfg_test.sql` (16 checks), `_shared/lfg_messages_test.ts`.
- /reschedule (step 20):
  - One set of rules: `request_reschedule_as(actor, match, proposed_at)` and `respond_reschedule_as(actor, request, accept)` enforce captaincy, 24h before the default time, same league week, future time and one pending request. The site's `request_reschedule` / `respond_reschedule` wrap them with `auth.uid()`. `reschedulable_matches_for(actor)` lists a captain's matches that can still move.
  - `/reschedule match:` (autocomplete of those matches) `day:` (autocomplete: remaining days of that match's league week) `time:` (choices 6:00 to 11:30 PM ET, 30-minute steps). Eastern wall time → UTC with `zonedToUtc` in `_shared/time.ts` (the bot's copy of the web time helpers; tested across DST).
  - `_shared/reschedule_flow.ts`: `postRescheduleRequest` posts the request in both team channels (Accept/Decline `reschedule:accept|decline:<requestId>` only in the opponent's), and `finishRescheduleRequest` turns both posts into the outcome and posts the result once per channel. Both claim `bot_events` (`rs:<id>`, `rs_done:<id>`), so the bot and the scheduler (site requests and answers via the outbox) never double-post.
  - Tests: `supabase/tests/reschedule_bot_test.sql` and the updated `reschedule_dispute_test.sql`, `_shared/time_test.ts`, `_shared/reschedule_messages_test.ts`.
- /report (step 21):
  - `/report match:` (autocomplete: `reportable_matches_for(actor)`, started, not settled, no open dispute) `shot1` (required) to `shot5` (attachments). The command saves the attachments in `pending_discord_reports` (Discord user + match, service role only) and opens a modal with one line per map: "Mode | Map | home-away".
  - Lines are parsed by `_shared/report_parse.ts` (tested): mode/map match exactly, by unique prefix, or by abbreviation (letters in order from the first, e.g. hp, snd, ctl); score "250-187" (home first); same series rules as the site. Errors list each bad line and echo what was typed; nothing is saved.
  - On success the screenshots are copied to `screenshots/matches/{match}/{team}/map{n}-d<stamp><i>.<ext>` (shot k → map k) and the maps go into `report_drafts` (one per match and team; own team and recused-out staff read it; only the bot writes). The reply links to `/report/<match>?prefill=<draft id>`, where the site form loads the maps and screenshots, pre-fills the line-up, and the captain enters the stats and submits with `submit_report(..., 'discord')`.
  - Differs from the guide on purpose: the guide saved a `report_submissions` row with empty player stats, but every report insert runs the comparison, so the opponent's full report would mismatch on every player. Drafts keep the Discord half out of the comparison until the site submit.
  - Tests: `supabase/tests/discord_report_test.sql` (8 checks), `_shared/report_parse_test.ts`.
- /dispute (step 22):
  - Disputes open only through `open_dispute_as(actor, match, category, description, evidence)` (window, captaincy, one open per match, evidence checks); the site's `open_dispute` wraps it. `disputable_matches_for(actor)` feeds the autocomplete.
  - `/dispute match: reason: evidence:` (optional image, kept in `pending_discord_disputes`) → modal for the description (https links in it become evidence) → dispute → private thread.
  - `_shared/dispute_flow.ts`: `ensureDisputeThread` creates one private thread per dispute in #disputes (`app_settings.discord_channels.disputes`), claimed in `bot_events` (`dispute:<id>`) and stored in `disputes.discord_thread_id`. Members come from `dispute_thread_people(dispute)`: both teams' captains and co-captains, plus owners/admins not on either team; recused admins are counted and a "Recused staff excluded" note is posted. Admins are added and pinged individually (not the HAL Admin role, which would pull recused admins in). The opening post has a "Resolve (admins)" link to /admin/disputes (decisions are written on the site so they're audited).
  - Scheduler: `dispute_opened` (site disputes) → thread; `dispute_comment` → mirrors site comments into the thread; `dispute_resolved` → posts the decision, archives and locks; `dispute_reopened` → unlocks. Discord thread messages are not copied to the site (no gateway).
  - The bot needs Create Private Threads, Send Messages in Threads and Manage Threads in #disputes, and captains need to see #disputes.
  - Tests: `supabase/tests/dispute_thread_test.sql` (7 checks), `_shared/dispute_messages_test.ts`.
- Production (step 23):
  - `netlify.toml` (repo root): `pnpm --filter web build` → `apps/web/dist`, SPA fallback, security headers and a strict CSP (Supabase incl. wss, raw.githubusercontent.com, api.github.com, Discord CDN, Google Fonts), immutable `/assets/*`. **Any new external host must be added to the CSP.**
  - `.github/workflows/ci.yml`: PRs and pushes run typecheck, lint, unit tests, build, Deno tests and `supabase db lint`; pushes to `main` run `supabase db push` and deploy all three functions. `verify_jwt = false` for all three lives in `supabase/config.toml`.
  - `docs/DEPLOY.md` lists every setting and secret (Netlify `VITE_*`, Edge Function secrets, Vault, GitHub secrets, in-app channel IDs) and the first-deploy order.
  - Monitoring: `src/lib/errorReporter.ts` sends uncaught errors (max 5 distinct per page, off in dev) to `log_client_error()` → `client_errors` (rate-limited, pruned after 30 days by pg_cron); stale route chunks after a deploy reload once. `/admin/health` (admins) uses `admin_health()`: site errors, bot errors, outbox backlog, cron job status. `__APP_RELEASE__` is the build's short commit.
  - Sharing: Open Graph/Twitter tags in `index.html` with `%HAL_SITE_URL%` filled from `VITE_SITE_URL` at build time; `public/og.png` (1200×630), `apple-touch-icon.png`, `icon-192/512.png`, `site.webmanifest`.
  - Tests: `supabase/tests/client_errors_test.sql`.
- Test seasons: only one active season can exist, so tests reuse it (forced to `signups` inside the rolled-back block). `supabase/tests/free_agents_test.sql` covers the board, privacy and posts.
- Check every page at 375px (no horizontal scroll). Don't put responsive `hidden`/`sm:inline-flex` classes on a component whose root already sets `display`; wrap it in a span instead.

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
- Audit log: the `audit_staff_change()` trigger is on every league table; add it to any new staff-editable table. It logs writes by staff (`actor_role` = their highest role) and by the service role (`actor_role` 'system', shown as "HAL bot"). Captain and player actions are not logged. Updates store only the changed columns (`updated_at` ignored). `audit_strip()` removes `discord_id`, `discord_thread_id`, `email`, `evidence_paths`, `screenshot_paths` and `*_token`/`*_secret` keys; add new private columns there. `audit_log` is append-only for every role, including the owner and the service role, because test rows written to the live database can never be removed (tests must roll back). The site reads `audit_log_public` (actor name plus a `summary` like "Admin jake changed match ALP vs BRV (week 2): week 1 → 2"); the raw table is staff-only. The Discord hook `audit_log_notify_discord()` exists but isn't attached yet (bot step; needs Vault `discord_sync_url` and `discord_sync_secret`).
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
