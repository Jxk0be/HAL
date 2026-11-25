<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UiInput from '@/components/ui/UiInput.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import RuleRow from '@/components/rules/RuleRow.vue'
import RuleCallout from '@/components/rules/RuleCallout.vue'
import { useRulebook } from '@/composables/useRulebook'
import { useActiveSeason } from '@/composables/useActiveSeason'
import { useToast } from '@/composables/useToast'
import { allRules, ruleMatches } from '@/lib/rulebook'
import { site } from '@/config/site'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { book, commit, loading } = useRulebook()
const { season } = useActiveSeason()

// ---- Search -------------------------------------------------------------
const term = ref('')
const searching = computed(() => term.value.trim().length >= 2)
const results = computed(() => (searching.value ? allRules(book.value).filter((r) => ruleMatches(r, term.value)) : []))
const resultSections = computed(() => {
  const groups = new Map<string, { number: string; title: string; rules: typeof results.value }>()
  for (const r of results.value) {
    const g = groups.get(r.section.number) ?? { number: r.section.number, title: r.section.title, rules: [] }
    g.rules.push(r)
    groups.set(r.section.number, g)
  }
  return [...groups.values()]
})

// ---- Deep links ---------------------------------------------------------
const highlighted = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | undefined

async function goTo(id: string, smooth = true) {
  term.value = ''
  await nextTick()
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  if (id.includes('.')) {
    highlighted.value = id
    clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => (highlighted.value = null), 2200)
  }
}

watch(
  [() => route.hash, loading],
  ([hash, isLoading]) => {
    if (!hash || isLoading) return
    void goTo(decodeURIComponent(hash.slice(1)), false)
  },
  { immediate: true, flush: 'post' },
)

async function copyLink(number: string) {
  const url = `${window.location.origin}/rules#${number}`
  await router.replace({ hash: `#${number}` })
  try {
    await navigator.clipboard.writeText(url)
    toast.success(`Link to rule ${number} copied.`)
  } catch {
    toast.show(url)
  }
}

function jump(number: string) {
  void router.replace({ hash: `#${number}` })
  void goTo(number)
}

// ---- Active section (table of contents) -----------------------------------
const active = ref<string | null>(null)
let observer: IntersectionObserver | null = null
/** Sections currently inside the "reading band" near the top of the viewport. */
const inBand = new Set<string>()
function observe() {
  observer?.disconnect()
  inBand.clear()
  if (typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) inBand.add(e.target.id)
        else inBand.delete(e.target.id)
      }
      // First section (in document order) inside the band wins.
      const first = book.value.sections.find((s) => inBand.has(s.number))
      if (first) active.value = first.number
    },
    { rootMargin: '-80px 0px -60% 0px' },
  )
  for (const s of book.value.sections) {
    const el = document.getElementById(s.number)
    if (el) observer.observe(el)
  }
}
watch([book, searching], async () => {
  await nextTick()
  if (!searching.value) observe()
}, { immediate: true, flush: 'post' })
onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(highlightTimer)
})

const updated = computed(() =>
  commit.value ? new Date(commit.value.date).toLocaleDateString(undefined, { dateStyle: 'long' }) : null,
)
const mobileToc = ref<HTMLDetailsElement | null>(null)
function mobileJump(number: string) {
  if (mobileToc.value) mobileToc.value.open = false
  jump(number)
}
</script>

<template>
  <div>
    <!-- Header -->
    <header class="border-b border-line">
      <div class="mx-auto max-w-7xl px-4 pt-10 pb-8 sm:px-6 sm:pt-14">
        <p class="eyebrow text-accent">{{ season?.name ?? site.name }}</p>
        <h1 class="mt-2 font-heading text-4xl sm:text-6xl">Official Rulebook</h1>
        <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <span v-if="book.effective">Effective {{ book.effective }}</span>
          <span v-if="updated" class="flex items-center gap-2">
            <span aria-hidden="true" class="hidden h-3 w-px bg-line-strong sm:inline-block" />
            Last updated <time :datetime="commit?.date">{{ updated }}</time>
          </span>
        </div>
        <div v-for="(p, i) in book.intro" :key="i" class="mt-5 max-w-3xl text-muted">
          <!-- eslint-disable-next-line vue/no-v-html -- sanitised inline fragment -->
          <p v-html="p.html" />
        </div>
      </div>
    </header>

    <div class="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[15rem_1fr]">
      <!-- Desktop table of contents -->
      <nav aria-label="Rulebook sections" class="hidden lg:block print:hidden">
        <div class="sticky top-24">
          <p class="eyebrow mb-3 text-muted">Sections</p>
          <ol class="flex flex-col border-l border-line">
            <li v-for="s in book.sections" :key="s.number">
              <a
                :href="`#${s.number}`"
                class="-ml-px flex gap-3 border-l-2 py-1.5 pl-4 text-sm transition-colors"
                :class="active === s.number && !searching ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'"
                :aria-current="active === s.number && !searching ? 'location' : undefined"
                @click.prevent="jump(s.number)"
              >
                <span class="tnum w-5 font-mono text-accent">{{ s.number }}</span>
                <span>{{ s.title }}</span>
              </a>
            </li>
          </ol>
        </div>
      </nav>

      <div class="min-w-0">
        <!-- Toolbar: search + mobile jump -->
        <div class="mb-8 flex flex-col gap-3 print:hidden" role="search">
          <UiInput v-model="term" label="Search the rules" placeholder="Search the rules, e.g. sub, reschedule, 4.2" hide-label>
            <template #prefix>
              <svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.5" />
                <path d="M13 13l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </template>
          </UiInput>
          <div v-if="searching" class="flex items-center gap-3 text-sm" aria-live="polite">
            <span class="tnum text-muted">{{ results.length }} {{ results.length === 1 ? 'rule matches' : 'rules match' }} “{{ term.trim() }}”</span>
            <button type="button" class="font-heading tracking-wider text-accent hover:text-accent-strong" @click="term = ''">Clear</button>
          </div>

          <details ref="mobileToc" class="group rounded-md border border-line bg-surface lg:hidden">
            <summary class="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-heading text-sm tracking-wider">
              Jump to section
              <svg viewBox="0 0 16 16" class="size-4 text-muted transition-transform group-open:rotate-180" fill="none" aria-hidden="true">
                <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </summary>
            <ol class="grid gap-px border-t border-line sm:grid-cols-2">
              <li v-for="s in book.sections" :key="s.number">
                <a
                  :href="`#${s.number}`"
                  class="flex gap-3 px-4 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-text"
                  @click.prevent="mobileJump(s.number)"
                >
                  <span class="tnum w-5 font-mono text-accent">{{ s.number }}</span>{{ s.title }}
                </a>
              </li>
            </ol>
          </details>
        </div>

        <!-- Search results -->
        <div v-if="searching">
          <p v-if="results.length === 0" class="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center text-muted">
            No rules match “{{ term.trim() }}”.
          </p>
          <section v-for="g in resultSections" :key="g.number" class="mb-6 rounded-lg border border-line bg-surface p-4 sm:p-6">
            <h2 class="mb-2 flex items-baseline gap-3 font-heading text-lg">
              <span class="tnum font-mono text-accent">{{ g.number }}</span>{{ g.title }}
            </h2>
            <RuleRow v-for="r in g.rules" :key="r.number" :rule="r" :term="term" @copy="jump" />
          </section>
        </div>

        <!-- Full rulebook -->
        <div v-else class="flex flex-col gap-6">
          <section
            v-for="s in book.sections"
            :id="s.number"
            :key="s.number"
            :aria-labelledby="`section-${s.number}-title`"
            class="scroll-mt-24 rounded-lg border border-line bg-surface p-4 sm:p-8 print:border-0 print:p-0"
          >
            <header class="mb-4 flex items-baseline gap-4 border-b border-line pb-4">
              <span class="tnum font-heading text-4xl leading-none text-accent sm:text-5xl print:text-black" aria-hidden="true">
                {{ s.number.padStart(2, '0') }}
              </span>
              <h2 :id="`section-${s.number}-title`" class="font-heading text-2xl sm:text-3xl">
                <span class="sr-only">Section {{ s.number }}: </span>{{ s.title }}
              </h2>
            </header>
            <template v-for="(b, i) in s.blocks" :key="i">
              <RuleRow v-if="b.kind === 'rule'" :rule="b" :highlighted="highlighted === b.number" @copy="copyLink" />
              <RuleCallout v-else-if="b.kind === 'callout'" :variant="b.variant" :html="b.html" />
              <!-- eslint-disable-next-line vue/no-v-html -- sanitised inline fragment -->
              <p v-else class="rule-prose px-2 py-2 text-muted" v-html="b.html" />
            </template>
          </section>

          <p class="flex flex-wrap items-center gap-2 text-xs text-muted print:hidden">
            <UiBadge variant="outline">Changes</UiBadge>
            Rule changes are announced in Discord, and the date above shows the latest one.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
