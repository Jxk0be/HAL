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

export interface OnboardingFields {
  activision_id: string | null
  platform: Platform | null
  age_confirmed_at: string | null
  controller_confirmed_at: string | null
}

/** Mirrors public.is_profile_complete(). */
export function isProfileComplete(p: OnboardingFields | null | undefined): boolean {
  if (!p) return false
  return Boolean(p.activision_id && p.platform && p.age_confirmed_at && p.controller_confirmed_at)
}

/** Turn database errors from profile saves into messages for people. */
export function profileErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'That Activision ID is already registered to another player.'
  if (error.code === '23514') return 'That doesn’t look like an Activision ID (Name#1234567).'
  if (error.code === 'P0001' || error.code === '42501') return error.message
  return 'Could not save your profile. Please try again.'
}
