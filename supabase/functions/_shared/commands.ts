/**
 * Slash command definitions: the single source for scripts/register-commands.ts and the router.
 * Plain TypeScript with no Deno or Node APIs, so both runtimes can import it.
 * Later steps add /lfg, /reschedule, /report and /dispute here.
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
  { name: 'ping', description: 'Check that the HAL bot is online', type: 1, dm_permission: false },
  { name: 'link', description: 'Get the link to your HAL profile', type: 1, dm_permission: false },
]
