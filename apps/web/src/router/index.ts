import { nextTick } from 'vue'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { site } from '@/config/site'

const Placeholder = () => import('@/views/PlaceholderView.vue')

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: 'Home' } },

  // Public
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
    path: '/teams',
    name: 'teams',
    component: () => import('@/views/TeamsView.vue'),
    meta: { title: 'Teams', eyebrow: 'League', description: 'Every team registered this season.', buildStep: 6 },
  },
  {
    path: '/teams/:id',
    name: 'team',
    component: () => import('@/views/TeamView.vue'),
    meta: { title: 'Team', eyebrow: 'Team', description: 'Roster, record and matches.', buildStep: 6 },
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
    path: '/rules',
    name: 'rules',
    component: () => import('@/views/RulesView.vue'),
    meta: { title: 'Rules' },
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
    meta: { title: 'Log in' },
  },

  // Signed in
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('@/views/AuthCallbackView.vue'),
    meta: { title: 'Signing in' },
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/views/OnboardingView.vue'),
    meta: { title: 'Set up your profile', requiresAuth: true },
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
  {
    path: '/my-team/reschedules',
    name: 'reschedules',
    component: Placeholder,
    meta: { title: 'Reschedule Requests', eyebrow: 'Captain', description: 'Propose or answer a new match time.', buildStep: 16, requiresAuth: true, player: true },
  },

  // Admin
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/admin/AdminHomeView.vue'),
    meta: { title: 'Admin', requiresAuth: true, staff: 'any' },
  },
  {
    path: '/admin/mismatches',
    name: 'admin-mismatches',
    component: Placeholder,
    meta: { title: 'Mismatch Queue', eyebrow: 'Admin', description: 'Stats where the two captains disagree.', buildStep: 15, requiresAuth: true, staff: 'admin' },
  },
  {
    path: '/admin/disputes',
    name: 'admin-disputes',
    component: Placeholder,
    meta: { title: 'Disputes', eyebrow: 'Admin', description: 'Open disputes and their evidence.', buildStep: 15, requiresAuth: true, staff: 'admin' },
  },
  {
    path: '/admin/rosters',
    name: 'admin-rosters',
    component: Placeholder,
    meta: { title: 'Roster Approvals', eyebrow: 'Admin', description: 'Emergency sub requests and roster fixes.', buildStep: 15, requiresAuth: true, staff: 'admin' },
  },
  {
    path: '/admin/season',
    name: 'admin-season',
    component: () => import('@/views/admin/AdminSeasonView.vue'),
    meta: { title: 'Season & Schedule', requiresAuth: true, staff: 'admin' },
  },
  {
    path: '/admin/content',
    name: 'admin-content',
    component: Placeholder,
    meta: { title: 'Content Management', eyebrow: 'Admin', description: 'Add, edit or remove any match, result, team or free agent post.', buildStep: 15, requiresAuth: true, staff: 'admin' },
  },
  {
    path: '/admin/roles',
    name: 'admin-roles',
    component: Placeholder,
    meta: { title: 'User Roles', eyebrow: 'Owner', description: 'Grant and revoke staff roles.', buildStep: 15, requiresAuth: true, staff: 'owner' },
  },
  {
    path: '/admin/discord',
    name: 'admin-discord',
    component: () => import('@/views/admin/AdminDiscordView.vue'),
    meta: { title: 'Discord sync', requiresAuth: true, staff: 'owner' },
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
