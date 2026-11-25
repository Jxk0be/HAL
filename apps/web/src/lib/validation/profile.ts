import type { Database } from '@/types/database'

export type Platform = Database['public']['Enums']['platform']

export const PLATFORM_OPTIONS: readonly { value: Platform; label: string }[] = [
  { value: 'playstation', label: 'PlayStation' },
  { value: 'xbox', label: 'Xbox' },
  { value: 'pc', label: 'PC (with a controller)' },
]

/** Mirrors the profiles_activision_id_format check constraint: Name#1234567, loosely. */
export const ACTIVISION_ID_PATTERN = /^[^#\s][^#]{1,31}#\d{4,10}$/

export function normalizeActivisionId(raw: string): string {
  return raw.trim().replace(/\s*#\s*/, '#')
}

/** Returns an error message, or null when the ID is valid. */
export function validateActivisionId(raw: string): string | null {
  const id = normalizeActivisionId(raw)
  if (!id) return 'Enter your Activision ID.'
  if (!id.includes('#')) return 'Include the # and the numbers after it, e.g. Name#1234567.'
  if (!ACTIVISION_ID_PATTERN.test(id)) return 'That doesn’t look like an Activision ID (Name#1234567).'
  return null
}

export type CodRank = Database['public']['Enums']['cod_rank']

/** Ranked-play ranks, lowest first. */
export const RANK_OPTIONS: readonly { value: CodRank; label: string }[] = [
  { value: 'bronze', label: 'Bronze' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'crimson', label: 'Crimson' },
  { value: 'iridescent', label: 'Iridescent' },
  { value: 'top250', label: 'Top 250' },
]
export const rankLabel = (r: CodRank | null | undefined) => RANK_OPTIONS.find((o) => o.value === r)?.label ?? 'No rank'

/**
 * Rules 2.8–2.9: Gold to Crimson play; Iridescent needs an admin-approved exception; Bronze,
 * Silver and Top 250 can't play in the league (8s are open to everyone). Mirrors rank_block_reason().
 */
export type RankStatus = 'missing' | 'eligible' | 'needs_exception' | 'too_low' | 'too_high'
export function rankStatus(rank: CodRank | null | undefined, exceptionAt: string | null | undefined): RankStatus {
  switch (rank) {
    case null:
    case undefined:
      return 'missing'
    case 'bronze':
    case 'silver':
      return 'too_low'
    case 'top250':
      return 'too_high'
    case 'iridescent':
      return exceptionAt ? 'eligible' : 'needs_exception'
    default:
      return 'eligible'
  }
}

export const RANK_STATUS_TEXT: Record<Exclude<RankStatus, 'eligible' | 'missing'>, string> = {
  needs_exception:
    'Iridescent players need an exception approved by an admin before they can join a team (rule 2.9). The admins have been told; you can still play 8s.',
  too_low: 'Blackhat is for Gold to Crimson players, so you can’t join a team this season (rule 2.8). 8s are open to everyone.',
  too_high: 'Top 250 players can’t play in Blackhat (rule 2.8). 8s are open to everyone.',
}

export interface OnboardingFields {
  activision_id: string | null
  platform: Platform | null
  age_confirmed_at: string | null
  controller_confirmed_at: string | null
  cod_rank: CodRank | null
  rank_exception_at: string | null
}

/** Every setup field filled in (rank included, whatever it is): the onboarding step is done. */
export function hasFinishedSetup(p: OnboardingFields | null | undefined): boolean {
  if (!p) return false
  return Boolean(p.activision_id && p.platform && p.age_confirmed_at && p.controller_confirmed_at && p.cod_rank)
}

/** Mirrors public.is_profile_complete(): set up and with a rank that can play in the league. */
export function isProfileComplete(p: OnboardingFields | null | undefined): boolean {
  return hasFinishedSetup(p) && rankStatus(p?.cod_rank, p?.rank_exception_at) === 'eligible'
}

/** Turn database errors from profile saves into messages for people. */
export function profileErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'That Activision ID is already registered to another player.'
  if (error.code === '23514') return 'That doesn’t look like an Activision ID (Name#1234567).'
  if (error.code === 'P0001' || error.code === '42501') return error.message
  return 'Could not save your profile. Please try again.'
}
