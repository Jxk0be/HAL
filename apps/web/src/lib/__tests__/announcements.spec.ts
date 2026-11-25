import { describe, expect, it } from 'vitest'
import { customAnnouncementProblem, parseCustomAnnouncement, previewLine } from '@/lib/announcements'

describe('custom announcements', () => {
  it('uses a bold or heading first line as the title', () => {
    expect(parseCustomAnnouncement('**Preseason matches are coming**\n\nBody\n- point')).toEqual({
      title: 'Preseason matches are coming',
      body: 'Body\n- point',
    })
    expect(parseCustomAnnouncement('# Big news\nText').title).toBe('Big news')
    expect(parseCustomAnnouncement('Plain start **bold**').title).toBeNull()
    expect(parseCustomAnnouncement('**a** and **b**').title).toBeNull()
  })

  it('checks it is not empty and fits Discord', () => {
    expect(customAnnouncementProblem('  ')).toMatch(/Write/)
    expect(customAnnouncementProblem('x'.repeat(4001))).toMatch(/too long/)
    expect(customAnnouncementProblem('**Hi**\nthere')).toBeNull()
  })

  it('previews bold runs and links as text', () => {
    expect(previewLine('a **b** [site](https://x)')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' site', bold: false },
    ])
  })
})
