import { RESCHEDULE_TIMES } from './time.ts'

/**
 * Slash command definitions: the single source for scripts/register-commands.ts and the router.
 * Plain TypeScript with no Deno or Node APIs, so both runtimes can import it.
 */

export const APPLICATION_COMMAND_TYPE = { CHAT_INPUT: 1 } as const

export interface CommandDefinition {
  name: string
  description: string
  type?: number
  options?: unknown[]
  /** Discord permission bits as a string; omit for everyone. */
  default_member_permissions?: string | null
  dm_permission?: boolean
}

export const COMMANDS: CommandDefinition[] = [
  { name: 'ping', description: 'Check that the bot is online', type: 1, dm_permission: false },
  { name: 'link', description: 'Get the link to your Blackhat profile', type: 1, dm_permission: false },
  { name: 'help', description: 'What this channel is for and which bot commands work here', type: 1, dm_permission: false },
  {
    name: 'lfg',
    description: 'Free agent posts in #free-agents',
    type: 1,
    dm_permission: false,
    options: [
      { type: 1, name: 'post', description: 'Post or edit your free agent post (shows on the site too)' },
      { type: 1, name: 'remove', description: 'Take your free agent post down' },
    ],
  },
  {
    name: 'reschedule',
    description: 'Ask the other team to move a match (captains, 24h before the default time)',
    type: 1,
    dm_permission: false,
    options: [
      { type: 3, name: 'match', description: 'One of your upcoming matches', required: true, autocomplete: true },
      { type: 3, name: 'day', description: 'Day in that league week (pick the match first)', required: true, autocomplete: true },
      { type: 3, name: 'time', description: 'Start time (Eastern)', required: true, choices: RESCHEDULE_TIMES },
    ],
  },
  {
    name: 'report',
    description: 'Report map scores and screenshots (captains); add player stats on the site',
    type: 1,
    dm_permission: false,
    options: [
      { type: 3, name: 'match', description: 'A match that has started and is not confirmed', required: true, autocomplete: true },
      { type: 11, name: 'shot1', description: 'Scoreboard screenshot for map 1', required: true },
      { type: 11, name: 'shot2', description: 'Map 2 screenshot', required: false },
      { type: 11, name: 'shot3', description: 'Map 3 screenshot', required: false },
      { type: 11, name: 'shot4', description: 'Map 4 screenshot', required: false },
      { type: 11, name: 'shot5', description: 'Map 5 screenshot', required: false },
    ],
  },
  {
    name: 'dispute',
    description: 'Open a dispute on a match (captains, within 24 hours)',
    type: 1,
    dm_permission: false,
    options: [
      { type: 3, name: 'match', description: 'The match', required: true, autocomplete: true },
      {
        type: 3,
        name: 'reason',
        description: 'What it is about',
        required: true,
        choices: [
          { name: 'Score', value: 'score' },
          { name: 'Player stats', value: 'stats' },
          { name: 'Conduct', value: 'conduct' },
          { name: 'Cheating', value: 'cheating' },
          { name: 'Eligibility', value: 'eligibility' },
          { name: 'Other', value: 'other' },
        ],
      },
      { type: 11, name: 'evidence', description: 'Screenshot (optional; paste video links in the description)', required: false },
    ],
  },
]
