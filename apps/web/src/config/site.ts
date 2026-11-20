/** Site-wide config. League copy and links live here, not hard-coded in components. */
export const site = {
  name: "Heaven's Arena League",
  shortName: 'HAL',
  tagline: 'Competitive Call of Duty for NA controller players.',
  discordInviteUrl: import.meta.env.VITE_DISCORD_INVITE_URL,
  rulebookRepo: import.meta.env.VITE_RULEBOOK_REPO,
  leagueTimezone: 'America/New_York',
} as const
