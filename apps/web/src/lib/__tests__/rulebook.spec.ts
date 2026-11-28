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

  it('sanitizes rule HTML and opens external links in a new tab', () => {
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

describe('recent changes', () => {
  const src = `# Rules

Intro.

Effective: November 20, 2026

Recent changes:

- **Nov 28, 2026** Added 3.13: everyone must be in the Discord. See also 4.2.
- **Nov 21, 2026**: Reworded 1.1 (no rule change).
- No date here, rule 2.10 changed.

## 1. General

**1.1** A rule.

- a list after a rule stays with the rule
`
  const book = parseRulebook(src)

  it('reads entries in order with their dates', () => {
    expect(book.changes.map((c) => c.date)).toEqual(['Nov 28, 2026', 'Nov 21, 2026', null])
    expect(book.changes[0]!.text).toBe('Added 3.13: everyone must be in the Discord. See also 4.2.')
  })

  it('links rule numbers and lists them', () => {
    expect(book.changes[0]!.rules).toEqual(['3.13', '4.2'])
    expect(book.changes[0]!.html).toContain('<a href="/rules#3.13">3.13</a>')
    expect(book.changes[2]!.rules).toEqual(['2.10'])
  })

  it('keeps the heading out of the intro and lists inside sections untouched', () => {
    expect(book.intro.map((p) => p.text)).toEqual(['Intro.'])
    const rule = book.sections[0]!.blocks[0]
    expect(rule?.kind === 'rule' && rule.list?.items[0]?.text).toBe('a list after a rule stays with the rule')
  })

  it('reads the real rulebook changes', () => {
    const real = parseRulebook(bundled)
    expect(real.changes.length).toBeGreaterThan(0)
    expect(real.changes[0]!.rules).toContain('3.13')
  })
})
