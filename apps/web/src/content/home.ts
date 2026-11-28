/** Home page copy. Keep league facts in step with CLAUDE.md and rules/rulebook.md. */
export const homeContent = {
  eyebrow: 'Call of Duty · NA · Controller · Gold to Crimson',
  headline: 'Compete for the crown.',
  intro:
    'Blackhat Invitational League is a free-entry competitive Call of Duty league for Gold to Crimson players, on the CDL ruleset. Best-of-5 series, twice a week, with a $250 prize for the champions.',
  status: 'Season 1 · Signups open soon',
  facts: [
    { label: 'Entry', value: 'Free' },
    { label: 'Ranks', value: 'Gold – Crimson' },
    { label: 'Prize pool', value: '$250' },
    { label: 'Format', value: 'Best of 5' },
    { label: 'Match nights', value: 'Tue & Thu · 9 PM ET' },
  ],
  /** Logged-out landing hero. */
  hero: {
    eyebrow: 'Invite-only · NA · Controller',
    headline: ['Compete for', 'the crown.'],
  },
  /** "How the league works" grid; `to` is a site path, `discord` links to the invite. */
  features: [
    { icon: 'season', title: 'Season format', body: 'Preseason, eight weeks of Bo5 series twice a week, then a top-8 playoff.', to: '/season' },
    { icon: 'teams', title: 'Teams & free agents', body: 'Build a squad of four starters and three subs, or get scouted off the free agent board.', to: '/teams' },
    { icon: 'matches', title: 'Match day', body: 'Check in 15 minutes out, play on the clock, and keep it clean under the CDL ruleset.', to: '/rules#7' },
    { icon: 'leaderboard', title: 'Double-entry stats', body: 'Both captains report every scoreboard. Stats only count when the two reports agree.', to: '/leaderboard' },
    { icon: 'watch', title: 'Broadcasts', body: 'Casters stream the biggest matches live, with replays on the Watch page.', to: '/watch' },
    { icon: 'eights', title: '8s pick-ups', body: 'Queue for casual 4v4s between league nights. Eight players, a mode vote, and a leaderboard.', to: '/8s' },
    { icon: 'discord', title: 'Discord bot', body: 'Reminders, check-in, results and team channels run straight from the league Discord.', discord: true },
  ],
  cta: {
    title: 'Gold to Crimson. Prove it.',
    body: 'Free entry, a real season and $250 to the champions. Sign in with Discord to get started.',
  },
  pillars: [
    {
      title: 'Real season structure',
      body: 'Two preseason weeks, an 8-week regular season with two matches a week, then a top-8 playoff.',
    },
    {
      title: 'Verified results',
      body: 'Both captains report every scoreboard. Stats only count when the two reports agree.',
    },
    {
      title: 'Staff in the open',
      body: 'Every staff action lands in a public audit log, and staff can never rule on their own team.',
    },
  ],
} as const
