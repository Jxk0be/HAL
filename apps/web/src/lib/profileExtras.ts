/**
 * Profile customization: bio, main role, favourite weapon, colour and socials. The rules mirror the
 * check constraints on public.profiles (site_features migration); keep them in step.
 */
export const BIO_MAX = 300
export const WEAPON_MAX = 40

export const PROFILE_COLORS = ['red', 'blue', 'green', 'gold', 'purple', 'teal'] as const
export type ProfileColor = (typeof PROFILE_COLORS)[number]
export const PROFILE_COLOR_LABEL: Record<ProfileColor, string> = {
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  gold: 'Gold',
  purple: 'Purple',
  teal: 'Teal',
}
/** The theme token for a colour (falls back to the league red). */
export const profileColorVar = (c: string | null | undefined) =>
  `var(--color-profile-${PROFILE_COLORS.includes(c as ProfileColor) ? c : 'red'})`

export type SocialKey = 'twitch' | 'youtube' | 'x' | 'tiktok'

export const SOCIALS: { key: SocialKey; label: string; pattern: RegExp; hint: string; url: (h: string) => string }[] = [
  { key: 'twitch', label: 'Twitch', pattern: /^[A-Za-z0-9_]{3,25}$/, hint: '3–25 letters, digits or _', url: (h) => `https://www.twitch.tv/${h}` },
  { key: 'youtube', label: 'YouTube', pattern: /^[A-Za-z0-9._-]{3,30}$/, hint: 'Your @handle', url: (h) => `https://www.youtube.com/@${h}` },
  { key: 'x', label: 'X', pattern: /^[A-Za-z0-9_]{1,15}$/, hint: 'Up to 15 letters, digits or _', url: (h) => `https://x.com/${h}` },
  { key: 'tiktok', label: 'TikTok', pattern: /^[A-Za-z0-9._]{2,24}$/, hint: '2–24 letters, digits, . or _', url: (h) => `https://www.tiktok.com/@${h}` },
]

/**
 * A handle from whatever the player pastes: "@name", "name" or a full profile link
 * (twitch.tv/name, youtube.com/@name, x.com/name, twitter.com/name, tiktok.com/@name).
 */
export function normalizeHandle(raw: string): string {
  let s = raw.trim()
  if (!s) return ''
  try {
    if (/^https?:\/\//i.test(s) || /^(www\.)?[a-z]+\.(tv|com)\//i.test(s)) {
      const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
      s = url.pathname.split('/').filter(Boolean)[0] ?? ''
    }
  } catch {
    // not a link: use as typed
  }
  return s.replace(/^@/, '')
}

/** An error message for a social handle, or null when it's empty or fine. */
export function handleProblem(key: SocialKey, handle: string): string | null {
  if (!handle) return null
  const s = SOCIALS.find((x) => x.key === key)!
  return s.pattern.test(handle) ? null : `That doesn't look like a ${s.label} handle (${s.hint}).`
}
