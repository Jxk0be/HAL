import type { Embed } from './discord.ts'

/** HAL gold from the logo (#F8B800) as a Discord colour integer. */
export const HAL_GOLD = 0xf8b800
export const HAL_WIN = 0x4fb07c
export const HAL_LOSS = 0xe0695b

const FOOTER = { text: "Heaven's Arena League" }

/** A HAL-styled embed: gold colour bar, HAL footer, timestamp. */
export function halEmbed(e: Omit<Embed, 'footer' | 'color'> & { color?: number }, now = new Date()): Embed {
  return {
    color: HAL_GOLD,
    timestamp: now.toISOString(),
    footer: FOOTER,
    ...e,
  }
}

/** Short ephemeral notice as an embed (used for errors and confirmations). */
export function noticeEmbed(description: string, tone: 'info' | 'success' | 'error' = 'info'): Embed {
  return halEmbed({
    description,
    color: tone === 'error' ? HAL_LOSS : tone === 'success' ? HAL_WIN : HAL_GOLD,
  })
}
