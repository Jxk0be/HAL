/** Site-wide config. League copy and links live here, not hard-coded in components. */
export const site = {
  name: 'Blackhat Invitational League',
  shortName: 'BIL',
  /** The two lines of the logo lockup. */
  wordmark: ['Blackhat', 'Invitational League'],
  tagline: 'Competitive Call of Duty for NA controller players.',
  discordInviteUrl: import.meta.env.VITE_DISCORD_INVITE_URL,
  leagueTimezone: 'America/New_York',
} as const

/** Primary navigation (header and mobile drawer). */
export const mainNav = [
  { label: 'Home', to: '/' },
  { label: 'Matches', to: '/matches' },
  { label: 'Standings', to: '/standings' },
  { label: 'Leaderboard', to: '/leaderboard' },
  { label: 'Teams', to: '/teams' },
  { label: 'Players', to: '/players' },
  { label: 'Free Agents', to: '/free-agents' },
  { label: 'Rules', to: '/rules' },
] as const
