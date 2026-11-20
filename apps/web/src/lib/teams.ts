import type { Database } from '@/types/database'

export type MemberRole = Database['public']['Enums']['member_role']
export type TeamStatus = Database['public']['Enums']['team_status']
export type Platform = Database['public']['Enums']['platform']

export interface RosterPlayer {
  memberId: string
  userId: string
  role: MemberRole
  joinedAt: string
  name: string
  avatarUrl: string | null
  activisionId: string | null
  platform: Platform | null
  isCaptain: boolean
  isCoCaptain: boolean
}

export interface SeasonRules {
  max_roster: number
  max_starters: number
  max_subs: number
  max_roster_changes: number
  roster_lock_at: string | null
  status: Database['public']['Enums']['season_status']
}

/** Team tag shown in brackets: 2–4 letters or digits. */
export const TAG_PATTERN = /^[A-Za-z0-9]{2,4}$/

export function validateTeamName(name: string): string | null {
  const n = name.trim()
  if (n.length < 2) return 'Team name must be at least 2 characters.'
  if (n.length > 40) return 'Team name must be 40 characters or fewer.'
  return null
}

export function validateTag(tag: string): string | null {
  return TAG_PATTERN.test(tag.trim()) ? null : 'Tag must be 2–4 letters or numbers.'
}

/** Captain first, then co-captain, starters, subs; alphabetical within each group. */
export function sortRoster(players: RosterPlayer[]): RosterPlayer[] {
  const rank = (p: RosterPlayer) => (p.isCaptain ? 0 : p.isCoCaptain ? 1 : p.role === 'starter' ? 2 : 3)
  return [...players].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

export function rosterCounts(players: RosterPlayer[]) {
  return {
    total: players.length,
    starters: players.filter((p) => p.role === 'starter').length,
    subs: players.filter((p) => p.role === 'sub').length,
  }
}

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const LOGO_MAX_BYTES = 1024 * 1024

export function validateLogo(file: File): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return 'Logo must be a PNG, JPG or WebP image.'
  if (file.size > LOGO_MAX_BYTES) return 'Logo must be 1 MB or smaller.'
  return null
}
