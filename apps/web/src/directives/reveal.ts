import type { Directive } from 'vue'

/**
 * v-reveal: fades and lifts an element in the first time it scrolls into view. The value is an
 * optional delay in ms for staggering siblings (v-reveal="i * 80"). Elements already on screen
 * reveal at once; without IntersectionObserver everything simply shows. Reduced motion shortens
 * the transition to nothing through the global rule in main.css.
 */
let observer: IntersectionObserver | null = null

function getObserver() {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        e.target.classList.add('is-revealed')
        observer?.unobserve(e.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  )
  return observer
}

export const vReveal: Directive<HTMLElement, number | undefined> = {
  mounted(el, binding) {
    if (typeof IntersectionObserver === 'undefined') return
    el.classList.add('reveal')
    if (binding.value) el.style.setProperty('--reveal-delay', `${binding.value}ms`)
    getObserver().observe(el)
  },
  unmounted(el) {
    observer?.unobserve(el)
  },
}

declare module 'vue' {
  interface GlobalDirectives {
    vReveal: typeof vReveal
  }
}
