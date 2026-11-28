import type { RouteLocationNormalizedLoaded } from 'vue-router'

/**
 * Key for the page transition: the path, so moving between records (/teams/a → /teams/b) remounts
 * and animates, while query and hash changes (filters, tabs) don't. Nested shells (admin) key on
 * their parent record so the shell stays mounted and only the child view animates.
 */
export function pageKey(route: RouteLocationNormalizedLoaded): string {
  const parent = route.matched[0]
  return route.matched.length > 1 && parent ? parent.path : route.path
}
