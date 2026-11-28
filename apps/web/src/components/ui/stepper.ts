export type StepState = 'done' | 'current' | 'upcoming'

/** State of each step given the current key. Unknown key → everything upcoming. */
export function stepStates(keys: readonly string[], currentKey: string | null | undefined): StepState[] {
  const at = currentKey == null ? -1 : keys.indexOf(currentKey)
  return keys.map((_, i) => (at < 0 ? 'upcoming' : i < at ? 'done' : i === at ? 'current' : 'upcoming'))
}
