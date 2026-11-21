import { ref, shallowRef } from 'vue'
import bundledSource from '../../../../rules/rulebook.md?raw'
import { parseRulebook, type Rulebook } from '@/lib/rulebook'

/**
 * The rulebook: rules/rulebook.md, bundled into the site at build time (so a push to main that
 * changes it goes live with the next Netlify deploy). The "last updated" date is the file's last
 * commit date, read at build time. Nothing is fetched from outside the site.
 */
export function useRulebook() {
  const book = shallowRef<Rulebook>(parseRulebook(bundledSource))
  const commit = ref<{ date: string } | null>(__RULEBOOK_COMMIT__ ? { date: __RULEBOOK_COMMIT__.date } : null)
  const loading = ref(false)
  return { book, commit, loading }
}
