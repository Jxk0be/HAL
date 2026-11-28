import { nextTick } from 'vue'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { site } from '@/config/site'


const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: 'Home' } },

  // Public
  {
    path: '/season',
    name: 'season',
    component: () => import('@/views/SeasonView.vue'),
    meta: { title: 'Season', tabHash: true },
  },
  {
    path: '/season/:id',
    name: 'season-by-id',
    component: () => import('@/views/SeasonView.vue'),
    meta: { title: 'Season', tabHash: true },
  },
  {
    path: '/matches',
    name: 'matches',
    component: () => import('@/views/MatchesView.vue'),
    meta: { title: 'Matches' },
  },
  {
    path: '/matches/:id',
    name: 'match',
    component: () => import('@/views/MatchView.vue'),
    meta: { title: 'Match' },
  },
  {
    path: '/standings',
    name: 'standings',
    component: () => import('@/views/StandingsView.vue'),
    meta: { title: 'Standings' },
  },
  {
    path: '/leaderboard',
    name: 'leaderboard',
    component: () => import('@/views/LeaderboardView.vue'),
    meta: { title: 'Leaderboard', tabHash: true },
  },
  {
    path: '/teams',
    name: 'teams',
    component: () => import('@/views/TeamsView.vue'),
    meta: { title: 'Teams', eyebrow: 'League', description: 'Every team registered this season.', buildStep: 6 },
  },
  {
    path: '/teams/:id',
    name: 'team',
    component: () => import('@/views/TeamView.vue'),
    meta: { title: 'Team', eyebrow: 'Team', description: 'Roster, record and matches.', buildStep: 6, tabHash: true },
  },
  {
    path: '/players',
    name: 'players',
    component: () => import('@/views/PlayersView.vue'),
    meta: { title: 'Players', eyebrow: 'League', description: 'Every player this season.', buildStep: 7 },
  },
  {
    path: '/players/:id',
    name: 'player',
    component: () => import('@/views/PlayerView.vue'),
    meta: { title: 'Player', eyebrow: 'Player', description: 'Profile, team and season stats.', buildStep: 7 },
  },
  {
    path: '/free-agents',
    name: 'free-agents',
    component: () => import('@/views/FreeAgentsView.vue'),
    meta: { title: 'Free Agents', eyebrow: 'Recruiting', description: 'Players looking for a team. Captains can invite them while they have an open spot.', buildStep: 7 },
  },
  {
    path: '/playoffs',
    name: 'playoffs',
    component: () => import('@/views/PlayoffsView.vue'),
    meta: { title: 'Playoffs', eyebrow: 'Postseason', description: 'The playoff bracket, filled in as results are confirmed.' },
  },
  {
    path: '/watch',
    name: 'watch',
    component: () => import('@/views/WatchView.vue'),
    meta: { title: 'Watch', eyebrow: 'Broadcasts', description: 'League matches live from our casters, plus replays.' },
  },
  {
    path: '/teams-recruiting',
    name: 'teams-recruiting',
    component: () => import('@/views/TeamsRecruitingView.vue'),
    meta: { title: 'Teams recruiting', eyebrow: 'Recruiting', description: 'Teams looking for a starter or a sub.' },
  },
  {
    path: '/8s',
    name: 'eights',
    component: () => import('@/views/EightsView.vue'),
    meta: { title: '8s' },
  },
  {
    path: '/rules',
    name: 'rules',
    component: () => import('@/views/RulesView.vue'),
    meta: { title: 'Rules' },
  },
  {
    path: '/maps',
    name: 'maps',
    component: () => import('@/views/MapsView.vue'),
    meta: { title: 'Map pool' },
  },
  {
    path: '/audit-log',
    name: 'audit-log',
    component: () => import('@/views/AuditLogView.vue'),
    meta: { title: 'Audit Log' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: 'Log in', layout: 'public' },
  },

  // Signed in
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('@/views/AuthCallbackView.vue'),
    meta: { title: 'Signing in', layout: 'public' },
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/views/OnboardingView.vue'),
    meta: { title: 'Set up your profile', requiresAuth: true, layout: 'public' },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: 'Dashboard', requiresAuth: true },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { title: 'My Profile', requiresAuth: true },
  },
  {
    path: '/my-team',
    name: 'my-team',
    component: () => import('@/views/MyTeamView.vue'),
    meta: { title: 'My Team', eyebrow: 'Captain', description: 'Create or manage your team: roster, invites, logo and co-captain.', buildStep: 6, requiresAuth: true, player: true },
  },
  {
    // Discord's /report links here with ?prefill=<submission id> (step 21).
    path: '/report/:matchId',
    name: 'report-match',
    component: () => import('@/views/ReportMatchView.vue'),
    meta: { title: 'Report Match', requiresAuth: true, player: true },
  },
  { path: '/my-team/report/:matchId', redirect: (to) => ({ name: 'report-match', params: to.params, query: to.query }) },
  // Reschedule requests live on the match page and in My Team's Requests panel.
  { path: '/my-team/reschedules', redirect: { name: 'my-team' } },

  // Admin: one shell with a sidebar; children inherit requiresAuth and narrow 'staff'.
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    meta: { requiresAuth: true, staff: 'any' },
    children: [
      { path: '', name: 'admin', component: () => import('@/views/admin/AdminHomeView.vue'), meta: { title: 'Admin' } },
      { path: 'casting', name: 'admin-casting', component: () => import('@/views/admin/AdminCastingView.vue'), meta: { title: 'Casting desk' } },
      { path: 'mismatches', name: 'admin-mismatches', component: () => import('@/views/admin/AdminMismatchesView.vue'), meta: { title: 'Mismatch Queue', staff: 'admin' } },
      { path: 'mismatches/:matchId', name: 'admin-mismatch', component: () => import('@/views/admin/AdminMismatchDetailView.vue'), meta: { title: 'Settle mismatches', staff: 'admin' } },
      { path: 'disputes', name: 'admin-disputes', component: () => import('@/views/admin/AdminDisputesView.vue'), meta: { title: 'Disputes', staff: 'admin' } },
      { path: 'rosters', name: 'admin-rosters', component: () => import('@/views/admin/AdminRostersView.vue'), meta: { title: 'Roster Approvals', staff: 'admin' } },
      { path: 'season', name: 'admin-season', component: () => import('@/views/admin/AdminSeasonView.vue'), meta: { title: 'Season & Schedule', staff: 'admin' } },
      { path: 'preseason', name: 'admin-preseason', component: () => import('@/views/admin/AdminPreseasonView.vue'), meta: { title: 'Preseason', staff: 'admin' } },
      { path: 'maps', name: 'admin-maps', component: () => import('@/views/admin/AdminMapsView.vue'), meta: { title: 'Modes & maps', staff: 'admin' } },
      { path: 'content', name: 'admin-content', component: () => import('@/views/admin/AdminContentView.vue'), meta: { title: 'Content', staff: 'admin' } },
      { path: 'roles', name: 'admin-roles', component: () => import('@/views/admin/AdminRolesView.vue'), meta: { title: 'User Roles', staff: 'owner' } },
      { path: 'announcements', name: 'admin-announcements', component: () => import('@/views/admin/AdminAnnouncementsView.vue'), meta: { title: 'Announcements', staff: 'admin' } },
      { path: 'health', name: 'admin-health', component: () => import('@/views/admin/AdminHealthView.vue'), meta: { title: 'Health', staff: 'admin' } },
      { path: 'discord', name: 'admin-discord', component: () => import('@/views/admin/AdminDiscordView.vue'), meta: { title: 'Discord sync', staff: 'owner' } },
    ],
  },

  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Page not found' },
  },
]

// Style guide, development builds only.
if (import.meta.env.DEV) {
  routes.splice(routes.length - 1, 0, {
    path: '/dev/ui',
    name: 'dev-ui',
    component: () => import('@/views/dev/StyleGuideView.vue'),
    meta: { title: 'Style guide' },
  })
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, _from, saved) {
    if (saved) return saved
    // The Rules page scrolls to its own anchors (ids like "4.2" aren't valid CSS selectors).
    if (to.name === 'rules' && to.hash) return false
    // Pages whose tabs live in the hash (#standings) keep their scroll position on a tab switch.
    if (to.meta.tabHash && to.path === _from.path) return false
    if (to.hash) {
      const id = decodeURIComponent(to.hash.slice(1))
      return document.getElementById(id) ? { el: `#${CSS.escape(id)}`, top: 80 } : { top: 0 }
    }
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth && !to.meta.staff) return true
  const auth = useAuthStore()
  await auth.init()

  if (!auth.isSignedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  const allowed =
    to.meta.staff === 'owner' ? auth.isOwner
    : to.meta.staff === 'admin' ? auth.isAdmin
    : to.meta.staff === 'any' ? auth.isStaff
    : true
  if (!allowed) {
    useToast().error("You don't have access to that page.")
    return { name: 'home' }
  }
  if (to.meta.player) {
    if (auth.isBanned) {
      useToast().error('Your account is banned from league play.')
      return { name: 'profile' }
    }
    if (!auth.isOnboarded) return { name: 'onboarding', query: { next: to.fullPath } }
  }
  return true
})

let firstNavigation = true
router.afterEach((to) => {
  document.title = to.meta.title && to.name !== 'home' ? `${to.meta.title} · ${site.shortName}` : site.name
  // Move focus to the page on client-side navigation so screen readers announce it.
  if (firstNavigation) {
    firstNavigation = false
    return
  }
  void nextTick(() => document.getElementById('main')?.focus({ preventScroll: true }))
})
