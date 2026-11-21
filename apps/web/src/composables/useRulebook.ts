import { computed, ref, shallowRef } from 'vue'
import bundledSource from '../../../../rules/rulebook.md?raw'
import { parseRulebook, type Rulebook } from '@/lib/rulebook'
import { site } from '@/config/site'

const CACHE_KEY = 'hal.rulebook.v1'
const CACHE_MS = 10 * 60 * 1000
const BRANCH = 'main'
const PATH = 'rules/rulebook.md'

interface Cached {
  at: number
  source: string
  commit: { date: string; message: string } | null
}

function readCache(): Cached | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached
    return Date.now() - parsed.at < CACHE_MS ? parsed : null
  } catch {
    return null
  }
}

function writeCache(value: Cached) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the page still works without the cache.
  }
}

async function fetchSource(): Promise<string> {
  const res = await fetch(`https://raw.githubusercontent.com/${site.rulebookRepo}/${BRANCH}/${PATH}`, {
    cache: 'no-cache',
  })
  if (!res.ok) throw new Error(`rulebook fetch ${res.status}`)
  return res.text()
}

async function fetchCommit(): Promise<{ date: string; message: string } | null> {
  const res = await fetch(
    `https://api.github.com/repos/${site.rulebookRepo}/commits?path=${encodeURIComponent(PATH)}&sha=${BRANCH}&per_page=1`,
    { headers: { Accept: 'application/vnd.github+json' } },
  )
  if (!res.ok) return null
  const data = (await res.json()) as { commit?: { committer?: { date?: string }; message?: string } }[]
  const c = data[0]?.commit
  return c?.committer?.date ? { date: c.committer.date, message: (c.message ?? '').split('\n')[0] ?? '' } : null
}

/**
 * The rulebook: fetched from GitHub at runtime (cached in sessionStorage for 10 minutes), falling
 * back to the copy bundled at build time when GitHub can't be reached (e.g. a private repo).
 */
export function useRulebook() {
  const book = shallowRef<Rulebook>(parseRulebook(bundledSource))
  const commit = ref<{ date: string; message: string } | null>(__RULEBOOK_COMMIT__)
  const source = ref<'bundled' | 'github'>('bundled')
  const loading = ref(true)

  async function load() {
    const cached = readCache()
    if (cached) {
      book.value = parseRulebook(cached.source)
      commit.value = cached.commit ?? commit.value
      source.value = 'github'
      loading.value = false
      return
    }
    try {
      const [text, latest] = await Promise.all([fetchSource(), fetchCommit().catch(() => null)])
      book.value = parseRulebook(text)
      commit.value = latest ?? commit.value
      source.value = 'github'
      writeCache({ at: Date.now(), source: text, commit: latest })
    } catch {
      // Keep the bundled copy.
    } finally {
      loading.value = false
    }
  }

  void load()

  const historyUrl = computed(() => `https://github.com/${site.rulebookRepo}/commits/${BRANCH}/${PATH}`)
  return { book, commit, source, loading, historyUrl }
}
