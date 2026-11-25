<script setup lang="ts">
import type { RuleBlock } from '@/lib/rulebook'
import { highlightParts } from '@/lib/rulebook'

const props = defineProps<{
  rule: RuleBlock
  /** When searching: show plain text with highlighted matches. */
  term?: string
  highlighted?: boolean
}>()
const emit = defineEmits<{ copy: [number: string] }>()

const parts = (text: string) => highlightParts(text, props.term ?? '')
</script>

<template>
  <div
    :id="rule.number"
    class="group relative grid scroll-mt-24 grid-cols-[3.25rem_1fr] gap-x-3 rounded-md px-2 py-3 transition-colors duration-700 sm:grid-cols-[4rem_1fr] print:break-inside-avoid"
    :class="highlighted ? 'bg-accent-soft' : ''"
  >
    <a
      :href="`#${rule.number}`"
      class="tnum pt-px font-mono text-sm font-semibold text-accent hover:text-accent-strong print:text-black"
      :aria-label="`Rule ${rule.number}`"
      @click.prevent="emit('copy', rule.number)"
    >
      {{ rule.number }}
    </a>
    <div class="min-w-0 pr-8 text-[0.95rem] leading-relaxed">
      <template v-if="term">
        <p>
          <template v-for="(p, i) in parts(rule.text)" :key="i">
            <mark v-if="p.match" class="rounded-sm bg-accent/30 px-0.5 text-text">{{ p.text }}</mark>
            <template v-else>{{ p.text }}</template>
          </template>
        </p>
      </template>
      <!-- eslint-disable-next-line vue/no-v-html -- sanitised inline fragment (lib/rulebook.ts) -->
      <p v-else class="rule-prose" v-html="rule.html" />

      <component
        :is="rule.list.ordered ? 'ol' : 'ul'"
        v-if="rule.list"
        class="mt-2 flex flex-col gap-1 pl-5 text-muted print:text-black"
        :class="rule.list.ordered ? 'list-decimal marker:text-accent' : 'list-disc marker:text-accent'"
      >
        <li v-for="(item, i) in rule.list.items" :key="i">
          <template v-if="term">
            <template v-for="(p, j) in parts(item.text)" :key="j">
              <mark v-if="p.match" class="rounded-sm bg-accent/30 px-0.5 text-text">{{ p.text }}</mark>
              <template v-else>{{ p.text }}</template>
            </template>
          </template>
          <!-- eslint-disable-next-line vue/no-v-html -- sanitised inline fragment -->
          <span v-else class="rule-prose" v-html="item.html" />
        </li>
      </component>
    </div>
    <button
      type="button"
      class="absolute top-2.5 right-1 rounded-sm p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent focus-visible:opacity-100 print:hidden"
      :aria-label="`Copy link to rule ${rule.number}`"
      @click="emit('copy', rule.number)"
    >
      <svg viewBox="0 0 20 20" class="size-4" fill="none" aria-hidden="true">
        <path d="M8.5 11.5a3 3 0 004.24 0l2.5-2.5a3 3 0 00-4.24-4.24l-.75.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        <path d="M11.5 8.5a3 3 0 00-4.24 0l-2.5 2.5a3 3 0 004.24 4.24l.75-.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>
