import { describe, expect, it } from 'vitest'
import bundled from '../../../../../rules/rulebook.md?raw'
import { allRules, highlightParts, parseRulebook, ruleMatches } from '../rulebook'

const sample = `# BIL Rulebook

Intro paragraph with **bold**.

Effective: November 20, 2026

## 1. General

> [!IMPORTANT]
> Be 18+.

**1.1** First rule with a [link](https://example.com) and <script>alert(1)</script>.

**1.2** Ties are broken in this order:
1. Series wins
2. Map differential

> [!NOTE]
> A clarification.

## 4. Substitutes

**4.2** Subs must be on the roster 24 hours before a match.
`

describe('parseRulebook', () => {
  const book = parseRulebook(sample)

  it('reads the title, intro and effective date', () => {
    expect(book.title).toBe('BIL Rulebook')
    expect(book.intro).toHaveLength(1)
    expect(book.intro[0]!.html).toContain('<strong>bold</strong>')
    expect(book.effective).toBe('November 20, 2026')
  })

  it('numbers sections from their headings', () => {
    expect(book.sections.map((s) => [s.number, s.title])).toEqual([
      ['1', 'General'],
      ['4', 'Substitutes'],
    ])
  })

  it('splits rules, callouts and lists', () => {
    const blocks = book.sections[0]!.blocks
    expect(blocks.map((b) => b.kind)).toEqual(['callout', 'rule', 'rule', 'callout'])
    expect(blocks[0]).toMatchObject({ kind: 'callout', variant: 'important', text: 'Be 18+.' })
    expect(blocks[3]).toMatchObject({ kind: 'callout', variant: 'note' })
    const tiebreak = blocks[2]
    expect(tiebreak?.kind === 'rule' && tiebreak.list?.items.map((i) => i.text)).toEqual([
      'Series wins',
      'Map differential',
    ])
  })

  it('sanitises rule HTML and opens external links in a new tab', () => {
    const rule = book.sections[0]!.blocks[1]
    expect(rule?.kind).toBe('rule')
    if (rule?.kind !== 'rule') return
    expect(rule.html).not.toContain('<script')
    expect(rule.html).toContain('target="_blank"')
    expect(rule.text).toContain('First rule with a link')
  })

  it('parses the real rulebook into 15 sections with rule 4.2', () => {
    const real = parseRulebook(bundled)
    expect(real.sections).toHaveLength(15)
    expect(allRules(real).some((r) => r.number === '4.2')).toBe(true)
    expect(real.effective).toBeTruthy()
    expect(bundled).not.toContain('(proposed)')
  })
})

describe('search helpers', () => {
  const rules = allRules(parseRulebook(sample))

  it('matches text, list items and rule numbers', () => {
    expect(rules.filter((r) => ruleMatches(r, 'roster')).map((r) => r.number)).toEqual(['4.2'])
    expect(rules.filter((r) => ruleMatches(r, 'differential')).map((r) => r.number)).toEqual(['1.2'])
    expect(rules.filter((r) => ruleMatches(r, '1.1')).map((r) => r.number)).toEqual(['1.1'])
  })

  it('splits text around every case-insensitive match', () => {
    expect(highlightParts('Subs and subs', 'SUBS')).toEqual([
      { text: 'Subs', match: true },
      { text: ' and ', match: false },
      { text: 'subs', match: true },
    ])
    expect(highlightParts('abc', '')).toEqual([{ text: 'abc', match: false }])
  })
})
