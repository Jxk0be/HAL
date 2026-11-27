# Discord server: setup guide and channel text

How to build the Blackhat Invitational League server from scratch and connect it to the bot and the
site, in order. Part 1 is the walkthrough; parts 2–4 are copy-paste text and reference.
Each text block is one Discord message (under the 2000-character limit). Replace `https://YOUR-SITE`
with the live site URL and `#channel` placeholders with real channel mentions.

The website rulebook is the official version. The #rules summary quotes it by section number;
when the rulebook changes, update the summary in the same edit.

What stays the same from the old server: the bot application, its token, its Interactions Endpoint
URL and the Supabase project. What changes: the server ID, the channel IDs and the invite link.

---

## 1. Setup, in order

### Step 1: Rename the bot (Discord Developer Portal)

1. https://discord.com/developers/applications → your bot's application.
2. **General Information:** name `Blackhat Bot`, app icon = `apps/web/src/assets/brand/emblem.png`.
   Check **Interactions Endpoint URL** still reads
   `https://lluwzpwiybvgnsimpwey.supabase.co/functions/v1/discord-interactions` (it belongs to the
   app, not the server, so it should still be there).
3. **Bot:** same username and avatar. Leave the token alone: it didn't change.

Do this before inviting the bot: its role in the server is named after it when it joins.

### Step 2: Create the server

1. Discord → **+** → Create My Own → For a club or community. Name it `Blackhat Invitational League`,
   icon = `emblem.png`.
2. Server Settings → **Enable Community** and follow the prompts. Community is needed for Onboarding,
   rules screening, announcement channels and Stage channels.
3. User Settings → Advanced → turn on **Developer Mode** (gives you "Copy ID" on right-click).
4. Right-click the server icon → **Copy Server ID**.

### Step 3: Point the bot at the new server

1. Supabase dashboard → Edge Functions → **Secrets** → edit `DISCORD_GUILD_ID` → paste the new server ID.
   If the site URL changed (Netlify rename), update `SITE_URL` here too.
2. On your computer, set `DISCORD_GUILD_ID` to the same ID in the repo-root `.env`.

### Step 4: Invite the bot

Open this link and pick the new server. It asks for exactly the permissions the bot uses:

https://discord.com/oauth2/authorize?client_id=1573484470487744522&permissions=361099423248&scope=bot%20applications.commands

(View Channels, Manage Roles, Manage Channels, Send Messages, Send Messages in Threads, Create Private
Threads, Manage Threads, Manage Messages (to pin its guides), Embed Links, Attach Files, Read Message
History, Mention @everyone (only for announcements you opt into), Connect, Speak, Video, Use Voice
Activity, Move Members. The voice permissions let it give each team access to its private voice channel;
Move Members lets it put 8s players into their team's voice channel.)

**Bot already in the server?** Opening the link again and authorising updates its role's permissions.
Or tick **Move Members** on the Blackhat Bot role (Server Settings → Roles) yourself.

### Step 5: Register the slash commands

From the repo root: `pnpm commands:register`. It should list `/ping, /link, /help, /lfg, /8s, /reschedule,
/report, /dispute`. Type `/ping` in any channel: "Blackhat bot online." means the bot is hooked up.

### Step 6: Create the categories and channels

Make them as listed below (create a category, then its channels inside it). **Don't** create the
Captain, Player, Free Agent, BIL Admin, BIL Caster or team roles, or the Team Channels category: the
bot makes those in step 8.

✍️ = you post the text from part 2 · 🤖 = the bot posts and keeps it up to date · 🔒 = read-only for @everyone

| Category            | Channel                          | Who writes                                                                         | Admin → Discord field |
| ------------------- | -------------------------------- | ---------------------------------------------------------------------------------- | --------------------- |
| **INFO**            | #start-here 🔒                   | ✍️                                                                                 | —                     |
|                     | #rules 🔒                        | ✍️                                                                                 | —                     |
|                     | #announcements 🔒                | staff + 🤖 season posts, "Now live"                                                | #announcements        |
| **LEAGUE**          | #team-rosters 🔒                 | 🤖 one post per approved team                                                      | #team-rosters         |
|                     | #standings 🔒                    | 🤖 one table per division                                                          | #standings            |
|                     | #match-schedule 🔒               | 🤖 one post per week                                                               | #match-schedule       |
|                     | #results 🔒                      | 🤖 confirmed results                                                               | #results              |
|                     | #player-of-the-week 🔒           | 🤖 Mondays at noon ET                                                              | #player-of-the-week   |
| **COMMUNITY**       | #general                         | everyone                                                                           | —                     |
|                     | #free-agents 🔒                  | 🤖 free agent cards (posted with the pinned guide's **Post as free agent** button) | #free-agents          |
|                     | #teams-recruiting                | captains                                                                           | —                     |
|                     | #sub-board 🔒                    | 🤖 teams short for a match, with an **I'm available** button                       | #sub-board            |
|                     | #clips                           | everyone                                                                           | —                     |
|                     | #suggestions                     | everyone                                                                           | —                     |
| **SUPPORT**         | #disputes 🔒                     | 🤖 private threads from `/dispute`                                                 | #disputes             |
| **STAFF** (private) | #admin-only                      | 🤖 alerts that ping BIL Admin                                                      | #admin-only           |
|                     | #audit-log                       | staff notes (the full log is public on the site)                                   | —                     |
| **VOICE**           | 🔊 Lobby                         | everyone                                                                           | —                     |
|                     | 🔊 Waiting Room                  | players waiting on staff (check-in or dispute help)                                | —                     |
|                     | 🔊 Casting Stage (Stage channel) | casters speak, everyone listens                                                    | —                     |
|                     | 🔊 Admin (private)               | staff                                                                              | —                     |
| **8s**              | #lf-8s                           | 🤖 queue post (Join / Leave / Leaderboard) and a post per match; players can chat  | #lf-8s                |
|                     | 🔊 8s Waiting Room               | queued players wait here so the bot can move them                                  | —                     |
|                     | 🔊 8s Team A                     | 🤖 Team A is moved here when a match starts                                        | 🔊 8s Team A          |
|                     | 🔊 8s Team B                     | 🤖 Team B is moved here                                                            | 🔊 8s Team B          |
| **TEAM CHANNELS**   | created by the bot               | 🤖 a private text + voice channel per approved team                                | —                     |

### Step 7: Connect the channels on the website

1. Log in on the site → **Admin → Discord** → **Channels** card.
2. For each field, right-click the matching channel in Discord → **Copy Channel ID** → paste.
   Thirteen fields: #announcements, #results, #free-agents, #disputes, #admin-only, #team-rosters,
   #standings, #match-schedule, #sub-board, #player-of-the-week, and for 8s #lf-8s, 🔊 8s Team A and
   🔊 8s Team B (right-click the voice channels the same way). Press **Save channels**.

### Step 8: Let the bot build its roles

On the same page press **Resync Discord**. The bot creates the roles **BIL Admin, BIL Caster,
Captain, Player, Free Agent** and the **Team Channels** category, and gives you BIL Admin (you're the
league owner). It's safe to run again any time something looks out of sync.

### Step 9: Order the roles

Server Settings → Roles, drag them into this order (top = most powerful). The bot can only manage
roles **below** its own, so its role must sit above everything it hands out:

1. **Blackhat Bot** (the bot's own role, created when it joined)
2. **BIL Admin**: tick _Display role members separately_
3. **BIL Caster**
4. **Captain**: tick _Display role members separately_
5. _team roles_ (one per approved team; the bot places them here automatically)
6. **Player**
7. **Free Agent**
8. @everyone

Role permissions (Server Settings → Roles → the role → Permissions). The bot uses roles for access
and labels, so they need very little:

- **BIL Admin:** Manage Messages, Manage Threads, Timeout Members, Kick Members, Mute Members, Move
  Members, Manage Nicknames, View Audit Log. Not Administrator: admins don't need to edit roles or
  channels, the bot does that.
- **BIL Caster, Captain, Player, Free Agent, team roles:** nothing beyond @everyone.
- **@everyone:** keep Discord's defaults (View Channels, Send Messages, Use Application Commands,
  Connect, Speak...). Turn **off** Mention @everyone.

### Step 10: Channel permissions

Edit Category/Channel → Permissions → add the role → set the box.

**Do this first: let the bot through.** A ✗ on @everyone in a channel also blocks the bot (Discord
applies channel denies over the permissions a role has server-wide). So before denying anything,
on each of the **INFO, LEAGUE, COMMUNITY, SUPPORT, STAFF and 8s** categories add the **Blackhat Bot**
role and tick ✓: View Channel, Send Messages, Send Messages in Threads, Create Private Threads,
Manage Threads, Embed Links, Attach Files, Read Message History, Manage Messages (to pin), Mention
@everyone, and on **8s** also Connect and Move Members (it moves players into 🔊 8s Team A/B). Then make every channel inside **sync to its category** (Edit Channel → Permissions →
Sync Now), so the bot's ✓ reaches it. If a channel shows "not synced", give the bot the same ✓ on
that channel too.

Then the restrictions:

- **🔒 read-only channels** (#start-here, #rules, #announcements, everything in LEAGUE, #sub-board,
  #disputes): @everyone → **Send Messages ✗**, **Create Public Threads ✗**. The bot still posts
  thanks to its ✓ above, and the #sub-board buttons still work. In #disputes keep **Send Messages in
  Threads ✓** so captains can talk in their private dispute threads.
- **#free-agents:** @everyone → **Send Messages ✗**, **Add Reactions ✗**. Nobody can type here, and that
  includes slash commands (Discord hides the message box). Players post with the **Post as free agent** /
  **Remove my post** buttons on the bot's pinned guide (step 11), or `/lfg post` from any other channel;
  the card always lands here.
- **8s voice channels:** a user limit of 8 on Team A/B is fine (the bot can move people into a full
  channel only if it has Move Members there, which the category ✓ above gives it).
- **#teams-recruiting:** read-only like #free-agents (@everyone → **Send Messages ✗**; the bot needs
  **Send Messages ✓** and **Embed Links ✓**). Captains post from **My team → Looking for players** on the
  site and the bot posts the card here. Set the channel ID in Admin → Discord → Bot channels.
- **Match Day / Match Archive categories:** created by the bot (it needs **Manage Channels**, which it
  already has for team channels). Each match gets a channel for both teams 15 minutes before; once the
  result is confirmed the teams lose access and it moves to Match Archive (admins can still read it).
  Delete old Match Archive categories between seasons if the server gets near Discord's 500-channel limit.
- **STAFF category and 🔊 Admin:** @everyone → **View Channel ✗**; BIL Admin → **View Channel ✓**.
  Sync the channels inside to the category.
- **🔊 Casting Stage:** a Stage channel; add BIL Caster (and BIL Admin) as **Stage Moderators**.
- **Team Channels category:** leave it alone. The bot sets each team channel so only that team,
  BIL Admin and the bot can see it.

### Step 11: Post the text and the guides

1. Paste the messages from part 2 into #start-here, #rules and the "pin this" channels, then pin them.
   Set the channel topics from part 3.
2. Admin → Discord → **Post channel guides**. The bot pins a "how this channel works" message (with the
   commands that work there) in #free-agents, #results, #disputes, #admin-only and every team channel.
3. The live boards (#team-rosters, #standings, #match-schedule, #sub-board, #player-of-the-week) fill
   in by themselves within 5 minutes once there's data: approved teams, a running season, results.
   The 8s queue post appears in #lf-8s within 5 minutes of saving its channel ID.

### Step 12: Invite link and website

1. Server name → **Invite People** → Edit invite link → Expire After **Never**, Max Uses **No limit**.
2. Netlify → Site configuration → Environment variables → `VITE_DISCORD_INVITE_URL` = that link →
   redeploy (Deploys → Trigger deploy). Every "Join the Discord" button on the site uses it.

### Step 13: Check it works

- `/ping` → "Blackhat bot online." · `/help` in a few channels → a private explanation for each.
- `/link` → your profile link.
- You have the **BIL Admin** role.
- Admin → Discord → **Bot and sync errors** is empty. If not, the error names the problem. The
  usual ones:
  - `403 ... Missing Permissions` / `Missing Access`: that channel (or its category) has no Blackhat
    Bot ✓ (step 10). Fix it, then press **Post channel guides** again.
  - `404 ... Unknown Channel`: a wrong channel ID in step 7.
  - Role errors: the bot's role sits too low (step 9).

## 2. Channel text

### #start-here

```
# Welcome to the Blackhat Invitational League 🕶️
A free-entry, NA-only Call of Duty: MW4 league on the CDL ruleset for **Gold to Crimson** players. Controller only, 18+. Best-of-5 series twice a week, with a $250 prize for the champions.

## Get set up (2 minutes)
**1.** Log in on the site with Discord: https://YOUR-SITE/login
**2.** Finish your profile: Activision ID, platform, your rank (the higher of your peak last CoD and your current rank), and the 18+ and controller confirmations.
**3.** Done. Your roles here update by themselves: **Free Agent** until you join a team, then your team's role and private text + voice channels.

## Find a team
• Free agents: press **Post as free agent** on the pinned message in #free-agents. It also shows on https://YOUR-SITE/free-agents
• Captains: post what you need from **My team → Looking for players** (it shows in #teams-recruiting), invite from the site, or press **Invite to team** on a #free-agents card.
• Players: press **I'm interested** on a #teams-recruiting card and the captains get a ping.
• Starting a team? Create it on the site while signups are open. It's approved once you have 4 players.

## Around the server
📋 #team-rosters · 🏆 #standings · 📅 #match-schedule · ✅ #results · ⭐ #player-of-the-week
🆘 #sub-board: teams short for a match. Not on a team? Press **I'm available**.
🎮 #lf-8s: casual 8s. Press **Join queue**, wait in 🔊 8s Waiting Room, and the bot picks the teams. Then vote on the mode; the map comes from https://YOUR-SITE/maps

Stuck? Type `/help` in any channel.
```

### #rules: message 1 (server rules)

```
# Server rules
**1. Be respectful.** No harassment, hate speech, slurs, threats or targeted trash talk. Banter is fine; making it personal isn't.
**2. No cheating talk.** No selling, promoting or asking about cheats, Cronus/XIM/strike packs, boosting or account sharing.
**3. Keep channels on topic.** Results and league business go through the bot and the site, not DMs.
**4. No spam or self-promo** outside the channels made for it.
**5. Use your real Activision ID** and keep your Discord linked to one Blackhat account.
**6. Staff decisions are final.** Disagree with a ruling? Use `/dispute` (captains) instead of arguing in public channels.

Breaking these can mean a warning, a mute, or removal from the server and the league (rulebook 11.3, 12.1).
```

### #rules: message 2 (league rules, short version)

```
# League rules: the short version
The full rulebook is the official version: https://YOUR-SITE/rules
Every staff action is public on the audit log: https://YOUR-SITE/audit-log

**Eligibility**
• 18+, North America only, controller only on every platform. PC players may be asked to screen-share (2.1–2.4).
• One account per Activision ID. Cheating devices = player banned permanently, team banned for the season (2.6, 11.1).
• Gold to Crimson only: the higher of your peak rank last CoD and your current rank. Iridescent needs an admin-approved exception; Bronze, Silver and Top 250 can't play. 8s are open to everyone (2.8–2.10).

**Rosters**
• Up to 4 starters + 3 subs. One team per player per season. Teams need 4 players to be approved (3.1–3.5).
• 3 roster changes per season once the regular season starts. Rosters lock about 2 weeks before playoffs (3.9–3.10).
• A player must be on the roster 24 hours before a match to play in it (4.2).
• Short-handed? Mark who's out on the match page and request up to 2 emergency subs who aren't on a team (4.3).

**Matches**
• Default nights: Tuesday and Thursday, 9:00 PM Eastern. Every match is a best-of-5 (5.3, 6.1).
• Reschedule: both captains agree at least 24h before the default time, to a time in the same week (6.2–6.3).
• Check in 15 minutes before: the captain picks exactly 4 players. 15 min late = lose map 1, 30 min late = lose the series (7.2–7.3).

**After the match**
• Both captains report with screenshots, on the site or with `/report`. Confirmed when both agree (9.1–9.2).
• Disputes: captains only, within 24 hours, with evidence. `/dispute` opens a private thread with the admins (10.1–10.3).
• 2 forfeits in a season = removed from the league (12.2).
```

### #rules: message 3 (in-game rules and lobby settings)

```
# In-game rules (GAs) and lobby settings
Full list: https://YOUR-SITE/rules (section 8) · Map pool: https://YOUR-SITE/maps

**Weapons** (nothing else is allowed) (8.4)
• AR: HAN 86 · SMG: VEL 46
• Pistol: anything but the Deagle and Revolver, no attachments

**Perks** (all three, everyone) (8.5)
• Kill Chain · Ninja · Battle Hardened

**Banned attachments** (8.6)
• Suppressors · headshot-damage multipliers · optics above 1x · all Apexes · long barrel on the VEL 46

**Grenades** (8.7)
• Hardpoint and Hijack: flash and stun only
• Search and Destroy: flash and stun, plus 1 smoke per team

**Lobby settings** (8.8–8.10)
• All modes: Tac Sprint On · Killstreaks Disabled · Killcams On · Team Assignment On · Friendly Fire Punish, limit 5 kills
• Search and Destroy: Equipment Delay 5 sec
• Hardpoint and Hijack: Respawn Delay 2.5 sec

Breaking a GA costs your team the map unless the rulebook lists another penalty (8.11).
```

### #teams-recruiting (pin this)

```
# Teams recruiting
Teams looking for a starter or a sub. The bot posts them here.

**Players:** press **I'm interested** on a card. The team's captains get a ping in their team channel, and if they want you the invite comes to your DMs and your profile with Accept / Decline.
**Captains:** post from **My team → Looking for players** on the site: https://YOUR-SITE/my-team. One post per team; edit it there. It comes down by itself once the spot is filled.

All posts are also on https://YOUR-SITE/teams-recruiting. Not seeing a fit? Press **Post as free agent** in #free-agents so captains can find you.
```

### #sub-board (pin this)

```
# Sub board
When a team marks players out of a match and drops below 4, the bot posts here.

**Free agents:** not on a team this season? Press **I'm available** on a post. The captain is told, picks a sub on the match page, you accept in your DMs, and an admin approves (rule 4.3).
**Can't make it after all?** Press **Withdraw**.

Posts disappear once the team is covered or the match starts.
```

### #clips (pin this)

```
# Clips
Post your best plays from league matches and scrims: Medal, YouTube, Twitch or Streamable links, or upload directly.
Tag your team and the match if you can. Staff pick favourites for #announcements and socials.
Keep it to clips. Banter goes in #general.
```

### #suggestions (pin this)

```
# Suggestions
Ideas for the league, the site or the server go here, one idea per message.
React 👍 / 👎 so staff can see what people want. Staff reply in a thread when something is planned or turned down.
Bug on the site? Include the page, what you pressed, and a screenshot.
```

### #player-of-the-week (pin this)

```
# Player of the Week
Every Monday at noon ET the bot posts last week's top performer: best average score with at least 2 maps played, plus two honourable mentions. Stats come from confirmed match reports only.
Full season stats: https://YOUR-SITE/leaderboard
```

---

## 3. Channel topics (Edit Channel → Topic)

| Channel             | Topic                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| #start-here         | New here? Log in on the site with Discord and your roles set themselves up.                                                            |
| #rules              | Short version here, official rulebook on the site.                                                                                     |
| #announcements      | League news from staff and the bot.                                                                                                    |
| #team-rosters       | Every approved team, kept up to date by the bot.                                                                                       |
| #standings          | Live division tables. Updated after every confirmed result.                                                                            |
| #match-schedule     | This week's matches in your time zone, with results as they land.                                                                      |
| #results            | Confirmed results, posted by the bot. Wrong? Captains /dispute in your team channel.                                                   |
| #player-of-the-week | Monday noon ET: last week's top performer.                                                                                             |
| #free-agents        | Free agents: press Post as free agent on the pinned message (or /lfg post from any channel) · Captains: press Invite to team on a card |
| #teams-recruiting   | Teams looking for players (posted from My team on the site) · Players: press I'm interested                                            |
| #sub-board          | Teams short for a match. Not on a team? Press I'm available.                                                                           |
| #clips              | Your best plays. Links or uploads.                                                                                                     |
| #suggestions        | One idea per message. 👍 / 👎 to vote.                                                                                                 |
| #disputes           | Private dispute threads. Open one with /dispute from your team channel.                                                                |

## 4. Discord settings worth turning on

- **Server Settings → Safety Setup / Onboarding → Rules Screening:** paste the six server rules so new
  members accept them before they can talk.
- **Onboarding → Default channels:** #start-here, #rules, #announcements, #general, #free-agents, #match-schedule, #standings.
- **Server Settings → Overview:** banner can use `apps/web/public/og.png`.
- **Invite link:** Server name → Invite People → Edit invite link → Expire After: **Never**, then put
  it in Netlify as `VITE_DISCORD_INVITE_URL`.
