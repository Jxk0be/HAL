import type { Component } from 'vue'
import {
  BookOpen,
  Dices,
  ClipboardList,
  Gauge,
  ListOrdered,
  House,
  Map,
  ScrollText,
  Settings2,
  Shield,
  Swords,
  Trophy,
  Tv,
  UserSearch,
  Users,
} from 'lucide-vue-next'
import type { NavIcon } from '@/config/site'

/** Icon component for each nav item. */
export const navIcons: Record<NavIcon, Component> = {
  home: House,
  dashboard: Gauge,
  season: Trophy,
  matches: Swords,
  teams: Shield,
  leaderboard: ClipboardList,
  watch: Tv,
  'free-agents': UserSearch,
  players: Users,
  maps: Map,
  rules: BookOpen,
  audit: ScrollText,
  standings: ListOrdered,
  eights: Dices,
  admin: Settings2,
}

export function isNavActive(to: string, path: string): boolean {
  return to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`)
}
