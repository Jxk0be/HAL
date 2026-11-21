import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/**
 * Permission checks for the bot, acting as a specific HAL user. They call the same rules as RLS
 * (the *_for SQL helpers, service-role only), so the bot can never do more than the site allows.
 */
export function permissionsFor(db: SupabaseClient, userId: string) {
  async function check(fn: string, args: Record<string, unknown> = {}): Promise<boolean> {
    const { data, error } = await db.rpc(fn, { p_user_id: userId, ...args })
    if (error) throw error
    return data === true
  }
  return {
    isAdmin: () => check('is_admin_for'),
    isStaff: () => check('is_staff_for'),
    isOwner: () => check('has_role_for', { p_role: 'owner' }),
    isCaster: () => check('has_role_for', { p_role: 'caster' }),
    isCaptainOf: (teamId: string) => check('is_captain_of_for', { p_team_id: teamId }),
    isOnTeam: (teamId: string) => check('is_on_team_for', { p_team_id: teamId }),
    isPartyToMatch: (matchId: string) => check('is_party_to_match_for', { p_match_id: matchId }),
    /** Admin AND not on either team in the match (recusal). */
    canStaffMatch: (matchId: string) => check('can_staff_match_for', { p_match_id: matchId }),
    canStaffTeam: (teamId: string) => check('can_staff_team_for', { p_team_id: teamId }),
  }
}
