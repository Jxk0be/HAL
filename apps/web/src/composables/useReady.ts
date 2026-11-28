import { ref, watch, type WatchSource } from 'vue'

/**
 * Page-level "has the data arrived?" flag. Starts false while `isLoading()` is true, flips to true
 * once the first load finishes (success or error) and then stays true, so realtime refreshes,
 * filter changes and paging never flash the page back to its skeleton.
 *
 * Pass `resetOn` (for example the route id) to show the skeleton again when the page switches to
 * a different record without remounting.
 */
export function useReady(isLoading: () => boolean, resetOn?: WatchSource) {
  const ready = ref(!isLoading())
  // flush: 'post' runs after every data composable's own (pre-flush) watchers, so a load that a
  // dependency just kicked off (season → standings) has already set its loading flag.
  watch(isLoading, (loading) => {
    if (!loading) ready.value = true
  }, { flush: 'post' })
  if (resetOn) {
    // flush: 'post' so the data composables' own watchers have already started their reload.
    watch(resetOn, () => {
      ready.value = !isLoading()
    }, { flush: 'post' })
  }
  return ready
}
