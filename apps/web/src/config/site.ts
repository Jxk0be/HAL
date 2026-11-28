/** Site-wide config. League copy and links live here, not hard-coded in components. */
export const site = {
  name: 'Blackhat Invitational League',
  shortName: 'BIL',
  /** The two lines of the logo lockup. */
  wordmark: ['Blackhat', 'Invitational League'],
  tagline: 'Competitive Call of Duty for NA controller players, Gold to Crimson.',
  discordInviteUrl: import.meta.env.VITE_DISCORD_INVITE_URL,
  /** #lf-8s channel link for the /8s page (falls back to the invite). */
  discordEightsUrl: import.meta.env.VITE_DISCORD_EIGHTS_URL || import.meta.env.VITE_DISCORD_INVITE_URL,
  leagueTimezone: 'America/New_York',
  /** Season hub copy and the fixed format facts (the rest comes from season settings). */
  game: 'Call of Duty: Modern Warfare 4',
  gameShort: 'MW4',
  teamSize: '4v4',
  seriesFormat: 'Best of 5',
  seasonAbout: [
    'An invite-only Call of Duty league for North American controller players ranked Gold to Crimson. Entry is free.',
    'Teams of four starters and up to three subs play two best-of-five series a week under the CDL ruleset and our Gentlemen\'s Agreements. Both captains report every match, and the top teams go to the playoffs.',
  ],
} as const

/** Navigation. `rail` items sit in the desktop rail; the rest go in the "More" menu. */
export type NavIcon =
  | 'home'
  | 'season'
  | 'matches'
  | 'teams'
  | 'leaderboard'
  | 'watch'
  | 'free-agents'
  | 'players'
  | 'maps'
  | 'rules'
  | 'audit'
  | 'standings'
  | 'eights'
  | 'admin'
  | 'dashboard'

export interface NavItem {
  label: string
  /** Shorter label for the 72px rail. */
  short?: string
  to: string
  icon: NavIcon
  rail: boolean
  /** Only shown when signed in / to staff. */
  auth?: boolean
  staff?: boolean
}

export const mainNav: readonly NavItem[] = [
  { label: 'Home', to: '/', icon: 'home', rail: true },
  { label: 'Dashboard', short: 'Me', to: '/dashboard', icon: 'dashboard', rail: true, auth: true },
  { label: 'Season', to: '/season', icon: 'season', rail: true },
  { label: 'Matches', to: '/matches', icon: 'matches', rail: true },
  { label: 'Teams', to: '/teams', icon: 'teams', rail: true },
  { label: 'Leaderboard', short: 'Ranks', to: '/leaderboard', icon: 'leaderboard', rail: true },
  { label: 'Watch', to: '/watch', icon: 'watch', rail: true },
  { label: 'Free Agents', short: 'FAs', to: '/free-agents', icon: 'free-agents', rail: true },
  { label: 'Standings', to: '/standings', icon: 'standings', rail: false },
  { label: 'Players', to: '/players', icon: 'players', rail: false },
  { label: '8s', to: '/8s', icon: 'eights', rail: false },
  { label: 'Maps', to: '/maps', icon: 'maps', rail: false },
  { label: 'Rules', to: '/rules', icon: 'rules', rail: false },
  { label: 'Audit Log', to: '/audit-log', icon: 'audit', rail: false },
  { label: 'Admin', to: '/admin', icon: 'admin', rail: false, staff: true },
]

/** Phone tab bar: four links plus "More". */
export const tabBarNav = ['/', '/season', '/matches', '/teams'] as const
