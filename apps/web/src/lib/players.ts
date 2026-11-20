/**
 * The name to show for a player. Discord usernames are only sent to signed-in users, so logged-out
 * visitors see the Activision ID instead.
 */
export function playerName(p: { discordUsername?: string | null; activisionId?: string | null }): string {
  return p.discordUsername || p.activisionId || 'Player'
}

export const FREE_AGENT_ROLES = ['AR', 'SMG', 'Flex'] as const
export type FreeAgentRole = (typeof FREE_AGENT_ROLES)[number]

export const PAGE_SIZE = 30
