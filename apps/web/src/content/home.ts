/** Home page copy. Keep league facts in step with CLAUDE.md and rules/rulebook.md. */
export const homeContent = {
  eyebrow: 'Call of Duty · NA · Controller only',
  headline: 'Compete for the crown.',
  intro:
    "Heaven's Arena League is a free-entry competitive Call of Duty league on the CDL ruleset. Best-of-5 series, twice a week, with a $200 prize for the champions.",
  status: 'Season 1 · Signups open soon',
  facts: [
    { label: 'Entry', value: 'Free' },
    { label: 'Prize pool', value: '$200' },
    { label: 'Format', value: 'Best of 5' },
    { label: 'Match nights', value: 'Tue & Thu · 9 PM ET' },
  ],
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
