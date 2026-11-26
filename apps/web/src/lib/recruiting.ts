/**
 * Team recruiting posts (My team → Looking for players, the Teams recruiting page and
 * #teams-recruiting). The database (recruit_save / recruit_block_reason) has the final say; these
 * mirror it so the form only offers what will save.
 */
export const LOOKING_FOR = ['starter', 'sub', 'any'] as const
export type LookingFor = (typeof LOOKING_FOR)[number]

export const LOOKING_FOR_LABEL: Record<LookingFor, string> = {
  starter: 'Starter',
  sub: 'Sub',
  any: 'Starter or sub',
}

export const RECRUIT_AVAILABILITY_MAX = 280
export const RECRUIT_NOTE_MAX = 1000

export interface OpenSpots {
  open: number
  startersOpen: number
  subsOpen: number
}

/** The kinds of spot the team can advertise right now. */
export function lookingForOptions(spots: OpenSpots): { value: LookingFor; label: string; disabled: boolean }[] {
  return LOOKING_FOR.map((value) => ({
    value,
    label: LOOKING_FOR_LABEL[value],
    disabled: !canLookFor(value, spots),
  }))
}

export function canLookFor(kind: LookingFor, spots: OpenSpots): boolean {
  if (spots.open <= 0) return false
  if (kind === 'starter') return spots.startersOpen > 0
  if (kind === 'sub') return spots.subsOpen > 0
  return true
}

/** "1 starter, 2 sub spots open" style summary. */
export function spotsSummary(spots: OpenSpots): string {
  if (spots.open <= 0) return 'Roster full'
  const parts: string[] = []
  if (spots.startersOpen > 0) parts.push(`${spots.startersOpen} starter`)
  if (spots.subsOpen > 0) parts.push(`${spots.subsOpen} sub`)
  return `${parts.join(', ') || spots.open} spot${spots.open === 1 ? '' : 's'} open`
}
