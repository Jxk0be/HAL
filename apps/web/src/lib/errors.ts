/**
 * Turn a Supabase/Postgres error into a message for people. League rule errors (P0001), permission
 * errors (42501) and not-found errors (P0002) raised by our triggers and RPCs are written for
 * players, so they pass through; Postgres' own row-security and privilege errors (also 42501) and
 * everything else get a generic message.
 */
export function dbErrorMessage(
  error: { code?: string; message: string } | null | undefined,
  fallback = 'Something went wrong. Please try again.',
  uniqueMessage?: string,
): string {
  if (!error) return fallback
  if (error.code === '23505' && uniqueMessage) return uniqueMessage
  if (/row-level security|permission denied/i.test(error.message)) {
    return "You don't have permission to do that."
  }
  if (error.code === 'P0001' || error.code === '42501' || error.code === 'P0002') return error.message
  return fallback
}
