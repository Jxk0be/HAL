# Discord server text

Copy-paste text for the channels the bot doesn't write. Each block below is one Discord message
(under Discord's 2000-character limit). Replace `https://YOUR-SITE` with the live site URL.

The bot writes the rest itself: Admin → Discord → **Post channel guides** pins a "how this channel
works" message in #lfg, #results, #disputes, the staff channel and every team channel, and `/help`
answers privately in any channel.

The website rulebook is the official version. The #rules summary below quotes it by section number;
when the rulebook changes, update the summary in the same edit.

---

## #start-here

### Message 1

```
# Welcome to Heaven's Arena League 👼
HAL is a free-entry, NA-only Call of Duty: MW4 league on the CDL ruleset. Controller only, 18+. Best-of-5 series twice a week, with a $200 prize for the champions.

## Get set up (2 minutes)
**1.** Log in on the site with Discord: https://YOUR-SITE/login
**2.** Finish your profile: Activision ID, platform, and the 18+ and controller confirmations.
**3.** That's it. Your roles here update by themselves: **Free Agent** until you join a team, then your team's role and private channel.

## Find a team
• Free agents: post in <#LFG_CHANNEL_ID> with `/lfg post`. It also shows on https://YOUR-SITE/free-agents
• Captains: invite players from the site or press **Invite to team** on a post.
• Want to start a team? Create one on the site while signups are open.

## Useful links
📖 Rules: https://YOUR-SITE/rules
📅 Schedule: https://YOUR-SITE/matches
🏆 Standings: https://YOUR-SITE/standings

Stuck? Type `/help` in any channel.
```

---

## #rules

### Message 1: server rules

```
# Server rules
**1. Be respectful.** No harassment, hate speech, slurs, threats or targeted trash talk. Banter is fine; making it personal isn't.
**2. No cheating talk.** No selling, promoting or asking about cheats, Cronus/XIM/strike packs, boosting or account sharing.
**3. Keep channels on topic.** Results and league business go through the bot and the site, not DMs.
**4. No spam or self-promo** outside the channels made for it.
**5. Use your real Activision ID** and keep your Discord linked to one HAL account.
**6. Staff decisions are final.** Disagree with a ruling? Use `/dispute` (captains) instead of arguing in public channels.

Breaking these can mean a warning, a mute, or removal from the server and the league (rulebook 11.3, 12.1).
```

### Message 2: league rules everyone needs to know

```
# League rules: the short version
The full rulebook is the official version: https://YOUR-SITE/rules
Every staff action is public on the audit log: https://YOUR-SITE/audit-log

**Eligibility**
• 18+, North America only, controller only on every platform. PC players may be asked to screen-share (2.1–2.4).
• One HAL account per Activision ID. Cheating devices = player banned permanently, team banned for the season (2.6, 11.1).

**Rosters**
• Up to 4 starters + 3 subs. One team per player per season (3.1–3.2).
• 3 roster changes per season once the regular season starts. Rosters lock about 2 weeks before playoffs (3.9–3.10).
• Leave or get dropped: 7 days before you can join another team in the same division (3.11).
• A player must be on the roster 24 hours before a match to play in it (4.2).

**Matches**
• Default nights: Tuesday and Thursday, 9:00 PM Eastern. Every match is a best-of-5 (5.3, 6.1).
• Reschedule: both captains agree at least 24h before the default time, to a time in the same week (6.2–6.3).
• Check in 15 minutes before: the captain picks exactly 4 players. 15 min late = lose map 1, 30 min late = lose the series (7.2–7.3).

**After the match**
• Both captains report with screenshots, on the site or with `/report`. Confirmed when both agree (9.1–9.2).
• No report from one side after 24h? The other report stands (9.4).
• Disputes: captains only, within 24 hours, with evidence. `/dispute` opens a private thread with the admins (10.1–10.3).
• 2 forfeits in a season = removed from the league (12.2).
```

---

## Channel topics (Edit Channel → Topic)

| Channel | Topic |
|---|---|
| #start-here | New here? Log in on the site with Discord and your roles set themselves up. |
| #rules | Short version here, official rulebook on the site. |
| #announcements | League news from staff and the bot. |
| #lfg-free-agents | Free agents: /lfg post · Captains: press Invite to team on a post · /help |
| #results | Confirmed results, posted by the bot. Wrong? Captains /dispute in your team channel. |
| #disputes | Private dispute threads. Open one with /dispute from your team channel. |

## Discord settings worth turning on

- **Server Settings → Safety Setup / Onboarding → Rules Screening:** paste the six server rules so new members accept them before they can talk.
- **#rules, #start-here, #announcements, #results:** deny Send Messages for @everyone (the bot and staff can still post).
- **Bot role:** give it **Pin Messages** (or Manage Messages) in Server Settings → Roles, so it can pin its guides in every channel, team channels included. Without it the guides are still posted, just not pinned.
