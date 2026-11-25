/**
 * Custom announcements pasted on Admin → Announcements. Mirrors parseCustomAnnouncement in
 * supabase/functions/_shared/announcements.ts (keep them in step) so the preview matches the post.
 */
export const CUSTOM_TITLE_MAX = 256
export const CUSTOM_BODY_MAX = 4000

/** A first line that is all bold (**Title**) or a heading (# Title) becomes the embed title. */
export function parseCustomAnnouncement(text: string): { title: string | null; body: string } {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n')
  const first = (lines[0] ?? '').trim()
  const m = first.match(/^\*\*(.+)\*\*$/) ?? first.match(/^#{1,3}\s+(.+)$/)
  if (m && m[1] && !m[1].includes('**')) {
    return { title: m[1].trim(), body: lines.slice(1).join('\n').trim() }
  }
  return { title: null, body: lines.join('\n').trim() }
}

/** Why the text can't be posted, or null. */
export function customAnnouncementProblem(text: string): string | null {
  const { title, body } = parseCustomAnnouncement(text)
  if (!title && !body) return 'Write the announcement first.'
  if (title && title.length > CUSTOM_TITLE_MAX) return `The title is too long (max ${CUSTOM_TITLE_MAX} characters).`
  if (body.length > CUSTOM_BODY_MAX) return `The text is too long (max ${CUSTOM_BODY_MAX} characters).`
  return null
}

export type PreviewPart = { text: string; bold: boolean }

/** One line of Discord markdown for the preview: **bold** runs, links shown as their text. */
export function previewLine(line: string): PreviewPart[] {
  const plain = line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '')
  return plain
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((s) => (s.startsWith('**') && s.endsWith('**') && s.length > 4 ? { text: s.slice(2, -2), bold: true } : { text: s, bold: false }))
}
