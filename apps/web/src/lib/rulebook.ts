import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

type Token = ReturnType<InstanceType<typeof MarkdownIt>['parse']>[number]

/**
 * Parses rules/rulebook.md into a small typed tree that the Rules page renders with Vue components.
 * Only inline fragments (a rule's text, a callout's text) become HTML, and every fragment goes
 * through DOMPurify. The whole document is never rendered as one v-html blob.
 *
 * Format (see the build guide, step 8):
 *   # Title / intro paragraphs / "Effective: <date>"
 *   ## 4. Substitutes            -> section "4"
 *   **4.2** Rule text            -> rule "4.2"
 *   > [!IMPORTANT] / > [!NOTE]   -> callouts
 *   1. list items                -> attached to the rule before them
 */

export interface RuleBlock {
  kind: 'rule'
  number: string
  html: string
  text: string
  list?: { ordered: boolean; items: { html: string; text: string }[] }
}
export interface CalloutBlock {
  kind: 'callout'
  variant: 'important' | 'note'
  html: string
  text: string
}
export interface ParagraphBlock {
  kind: 'paragraph'
  html: string
  text: string
}
export type Block = RuleBlock | CalloutBlock | ParagraphBlock

export interface Section {
  number: string
  title: string
  blocks: Block[]
}

export interface Rulebook {
  title: string
  intro: { html: string; text: string }[]
  effective: string | null
  sections: Section[]
}

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

// External links open in a new tab; same-site links stay in the tab.
const defaultLink = md.renderer.rules.link_open
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = String(tokens[idx]?.attrGet('href') ?? '')
  if (/^https?:\/\//.test(href)) {
    tokens[idx]?.attrSet('target', '_blank')
    tokens[idx]?.attrSet('rel', 'noopener noreferrer')
  }
  return defaultLink ? defaultLink(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'em', 'a', 'code', 'br', 's'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })
}

function inline(src: string): { html: string; text: string } {
  const tokens = md.parseInline(src, {})
  const text = (tokens[0]?.children ?? [])
    .map((t) => (t.type === 'softbreak' || t.type === 'hardbreak' ? ' ' : t.content))
    .join('')
    .trim()
  return { html: sanitize(md.renderInline(src)), text }
}

const RULE_RE = /^\*\*(\d+\.\d+)\*\*\s*([\s\S]*)$/
const SECTION_RE = /^(\d+)\.\s+(.+)$/
const CALLOUT_RE = /^\[!(IMPORTANT|NOTE)\]\s*\n?([\s\S]*)$/i
const EFFECTIVE_RE = /^Effective:\s*(.+)$/i

export function parseRulebook(source: string): Rulebook {
  const tokens: Token[] = md.parse(source, {})
  const book: Rulebook = { title: '', intro: [], effective: null, sections: [] }
  let section: Section | null = null
  let blockquoteDepth = 0
  let list: { ordered: boolean; items: { html: string; text: string }[] } | null = null
  let listItemDepth = 0

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    switch (t.type) {
      case 'heading_open': {
        const content = tokens[i + 1]?.content.trim() ?? ''
        if (t.tag === 'h1') book.title = content
        if (t.tag === 'h2') {
          const m = SECTION_RE.exec(content)
          section = { number: m?.[1] ?? String(book.sections.length + 1), title: m?.[2] ?? content, blocks: [] }
          book.sections.push(section)
        }
        i += 2
        break
      }
      case 'blockquote_open':
        blockquoteDepth++
        break
      case 'blockquote_close':
        blockquoteDepth--
        break
      case 'bullet_list_open':
      case 'ordered_list_open':
        list = { ordered: t.type === 'ordered_list_open', items: [] }
        break
      case 'bullet_list_close':
      case 'ordered_list_close': {
        const last = section?.blocks.at(-1)
        if (list && last?.kind === 'rule') last.list = list
        else if (list && section) {
          for (const item of list.items) section.blocks.push({ kind: 'paragraph', ...item })
        }
        list = null
        break
      }
      case 'list_item_open':
        listItemDepth++
        break
      case 'list_item_close':
        listItemDepth--
        break
      case 'inline': {
        const content = t.content.trim()
        if (!content) break
        if (list && listItemDepth > 0) {
          list.items.push(inline(content))
          break
        }
        if (blockquoteDepth > 0) {
          const m = CALLOUT_RE.exec(content)
          const variant = m?.[1]?.toLowerCase() === 'important' ? 'important' : 'note'
          const body = inline((m?.[2] ?? content).trim())
          const target = section?.blocks
          if (target) target.push({ kind: 'callout', variant, ...body })
          else book.intro.push(body)
          break
        }
        if (!section) {
          const eff = EFFECTIVE_RE.exec(content)
          if (eff?.[1]) book.effective = eff[1].trim()
          else book.intro.push(inline(content))
          break
        }
        const rule = RULE_RE.exec(content)
        if (rule?.[1]) section.blocks.push({ kind: 'rule', number: rule[1], ...inline(rule[2] ?? '') })
        else section.blocks.push({ kind: 'paragraph', ...inline(content) })
        break
      }
    }
  }
  return book
}

/** Every rule as a flat list (for search). */
export function allRules(book: Rulebook): (RuleBlock & { section: Section })[] {
  return book.sections.flatMap((s) =>
    s.blocks.filter((b): b is RuleBlock => b.kind === 'rule').map((r) => ({ ...r, section: s })),
  )
}

/** A rule matches if the term is in its text, its list items or its number. */
export function ruleMatches(rule: RuleBlock, term: string): boolean {
  const q = term.trim().toLowerCase()
  if (!q) return true
  return (
    rule.number === q ||
    rule.text.toLowerCase().includes(q) ||
    (rule.list?.items.some((i) => i.text.toLowerCase().includes(q)) ?? false)
  )
}

/** Split plain text into parts so matches can be wrapped in <mark> without any HTML. */
export function highlightParts(text: string, term: string): { text: string; match: boolean }[] {
  const q = term.trim()
  if (!q) return [{ text, match: false }]
  const parts: { text: string; match: boolean }[] = []
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  let at = 0
  for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, at)) {
    if (i > at) parts.push({ text: text.slice(at, i), match: false })
    parts.push({ text: text.slice(i, i + q.length), match: true })
    at = i + q.length
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false })
  return parts
}
