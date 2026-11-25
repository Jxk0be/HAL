/**
 * What each Discord channel is for and which bot commands work there. Used by /help (personal,
 * ephemeral) and by the pinned channel guides the bot posts and keeps up to date. Pure: no I/O.
 *
 * Keep the wording in step with rules/rulebook.md (section numbers are quoted) and with the
 * command list in commands.ts.
 */
import type { Embed } from './discord.ts'
import { halEmbed } from './embeds.ts'

/** Channels the bot knows about. "team" is any private team channel. */
export type ChannelKind = 'team' | 'lfg' | 'results' | 'disputes' | 'announcements' | 'admin' | 'other'

/** Channels that get a pinned guide (announcements stays clean; "other" has no fixed channel). */
export const GUIDE_KINDS = ['team', 'lfg', 'results', 'disputes', 'admin'] as const satisfies readonly ChannelKind[]

export interface Viewer {
  /** Has a BIL account linked to this Discord user. */
  linked: boolean
  /** Captain or co-captain of the team whose channel this is. */
  captain: boolean
  teamName?: string | null
}

type Field = NonNullable<Embed['fields']>[number]

const ANYWHERE: Field = {
  name: 'Anywhere',
  value: '`/help` what works here · `/link` your Blackhat profile · `/ping` is the bot up?',
}

const CAPTAIN_COMMANDS =
  '`/report` after the match: pick it, attach up to 5 scoreboard screenshots, then enter the map scores. Player stats go on the site (9.1).\n' +
  '`/reschedule` move a match: at least 24h before the default time, to a time in the same week. The other captain accepts or declines with the buttons (6.2–6.3).\n' +
  '`/dispute` within 24 hours of the match, with evidence. Opens a private thread with both captains and the admins (10.2–10.3).'

function rulesLine(siteUrl: string) {
  return `[Full rulebook](${siteUrl}/rules) · [Schedule](${siteUrl}/matches) · [Standings](${siteUrl}/standings)`
}

function guideParts(kind: ChannelKind, siteUrl: string): { title: string; description: string; fields: Field[] } {
  switch (kind) {
    case 'team':
      return {
        title: 'Your team channel',
        description:
          'Private to your roster, league admins and the bot. Match reminders, check-in and reschedule requests land here.',
        fields: [
          {
            name: 'Match day',
            value:
              'Reminders 24h and 1h before each match (7.1).\n' +
              'Check-in opens 15 minutes before: the captain or co-captain presses **Check in** and picks exactly 4 players (7.2).\n' +
              '15 minutes late loses map 1; 30 minutes late loses the series (7.3).',
          },
          { name: 'Captains and co-captains', value: CAPTAIN_COMMANDS },
          {
            name: 'Roster',
            value: `Invites, removals and team settings are on [My team](${siteUrl}/my-team). 3 roster changes per season once the regular season starts (3.9).`,
          },
          ANYWHERE,
        ],
      }
    case 'lfg':
      return {
        title: 'Looking for a team',
        description: `Free agent posts. Every post here is also on the [Free agents page](${siteUrl}/free-agents).`,
        fields: [
          {
            name: 'Free agents',
            value:
              '`/lfg post` post or edit your free agent post (role, availability, a short note).\n' +
              '`/lfg remove` take it down when you join a team or stop looking.\n' +
              'You need a finished Blackhat profile first: `/link`.',
          },
          {
            name: 'Captains',
            value: 'Press **Invite to team** on a post. The player gets a DM and accepts on the site. Invites last 7 days (3.6).',
          },
          ANYWHERE,
        ],
      }
    case 'results':
      return {
        title: 'Results',
        description: 'Confirmed results are posted here by the bot. Read-only.',
        fields: [
          {
            name: 'How results get here',
            value:
              'Both captains report with `/report` in their team channel or on the site. A result is confirmed once both reports agree (9.2).\n' +
              "If one captain hasn't reported 24 hours after the match, the other report stands (9.4).",
          },
          { name: 'Something wrong?', value: 'Captains: `/dispute` in your team channel within 24 hours of the match (10.2).' },
          ANYWHERE,
        ],
      }
    case 'disputes':
      return {
        title: 'Disputes',
        description: 'Each dispute gets its own private thread here with both captains and the admins. Nobody else can see it.',
        fields: [
          {
            name: 'Opening one',
            value:
              'Captains: `/dispute` in your team channel, within 24 hours of the match, with evidence (screenshots, clips or recordings). ' +
              "Pick the match, the reason, and attach a screenshot; paste video links in the description (10.1–10.2).",
          },
          {
            name: 'After that',
            value: 'Talk it through in the thread. Admins may ask for VODs or POVs, and decide on the site. Admin decisions are final (10.4–10.5).',
          },
          ANYWHERE,
        ],
      }
    case 'admin':
      return {
        title: 'Staff channel',
        description: 'Bot alerts for league staff.',
        fields: [
          {
            name: 'Where to act',
            value: `Mismatches, disputes, rosters and results are handled on the [admin panel](${siteUrl}/admin), so every decision is in the public audit log.`,
          },
          {
            name: 'Recusal',
            value: 'Never act on a match or team you are rostered on. Another admin handles it; the database enforces this (14.3–14.4).',
          },
          ANYWHERE,
        ],
      }
    case 'announcements':
    case 'other':
      return {
        title: 'Blackhat Invitational League bot',
        description: 'Commands by channel:',
        fields: [
          { name: 'Your team channel (captains)', value: '`/report` · `/reschedule` · `/dispute` · **Check in** button' },
          { name: '#free-agents', value: '`/lfg post` · `/lfg remove` · **Invite to team** button (captains)' },
          ANYWHERE,
        ],
      }
  }
}

/** The pinned guide for a channel (the same for everyone who reads it). */
export function guideEmbed(kind: ChannelKind, siteUrl: string): Embed {
  const g = guideParts(kind, siteUrl)
  return halEmbed({
    title: g.title,
    description: `${g.description}\n\n${rulesLine(siteUrl)}`,
    fields: g.fields,
  })
}

/** /help: the channel's guide plus a line about the viewer (linked? captain here?). */
export function helpEmbeds(kind: ChannelKind, viewer: Viewer, siteUrl: string): Embed[] {
  const notes: string[] = []
  if (!viewer.linked) {
    notes.push(`You're not on Blackhat yet. [Log in with Discord](${siteUrl}/login) to create your player profile; your roles update automatically.`)
  } else if (kind === 'team') {
    notes.push(
      viewer.captain
        ? `You're a captain${viewer.teamName ? ` of ${viewer.teamName}` : ''}, so the captain commands are yours.`
        : 'Only your captain and co-captain can check in, report, reschedule or dispute.',
    )
  }
  const guide = guideEmbed(kind, siteUrl)
  if (notes.length) guide.description = `${notes.join('\n')}\n\n${guide.description}`
  return [guide]
}
