/** Read a tab value from a URL hash ("#standings"), if it is one of the allowed values. */
export function tabFromHash<T extends string>(hash: string, values: readonly T[]): T | null {
  let raw = hash.replace(/^#/, '')
  try {
    raw = decodeURIComponent(raw)
  } catch {
    return null
  }
  return (values as readonly string[]).includes(raw) ? (raw as T) : null
}
