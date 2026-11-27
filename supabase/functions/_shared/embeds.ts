import type { Embed } from './discord.ts'

/** Brand red (#D91F2B) as a Discord color integer. */
export const BRAND_RED = 0xd91f2b
export const HAL_WIN = 0x4fb07c
export const HAL_LOSS = 0xf2785c

const FOOTER = { text: 'Blackhat Invitational League' }

/** A league-styled embed: red color bar, league footer, timestamp. */
export function halEmbed(e: Omit<Embed, 'footer' | 'color'> & { color?: number }, now = new Date()): Embed {
  return {
    color: BRAND_RED,
    timestamp: now.toISOString(),
    footer: FOOTER,
    ...e,
  }
}

/** Short ephemeral notice as an embed (used for errors and confirmations). */
export function noticeEmbed(description: string, tone: 'info' | 'success' | 'error' = 'info'): Embed {
  return halEmbed({
    description,
    color: tone === 'error' ? HAL_LOSS : tone === 'success' ? HAL_WIN : BRAND_RED,
  })
}
