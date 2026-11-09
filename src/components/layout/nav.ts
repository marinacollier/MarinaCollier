import { Briefcase, CalendarDays, Sprout, Sun, Wallet } from 'lucide-react'
import { ROUTES } from '@/app/routes'

/**
 * MARINA OS 2.0 — five places: Hoje (the day) · Agenda (one calendar for everything) · Minha Vida (life areas) ·
 * Projetos (work, career, UGC) · Finanças. Settings and integrations live behind the avatar on Hoje.
 */
export const TABS = [
  { to: ROUTES.today, label: 'Hoje', icon: Sun, end: true },
  { to: ROUTES.agenda, label: 'Agenda', icon: CalendarDays },
  { to: ROUTES.spaces, label: 'Minha Vida', icon: Sprout },
  { to: ROUTES.projects, label: 'Projetos', icon: Briefcase },
  { to: ROUTES.money, label: 'Finanças', icon: Wallet },
] as const

const PROJECT_PATHS = [ROUTES.projects, ROUTES.work, ROUTES.career]

/** The tab a page belongs to (pages reached from a hub keep that hub lit). */
export function activeTab(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/lumos') || pathname.startsWith('/ajustes')) return ROUTES.today
  if (pathname.startsWith(ROUTES.agenda) || pathname.startsWith(ROUTES.weekPlanner) || pathname.startsWith(ROUTES.myWeek)) return ROUTES.agenda
  if (PROJECT_PATHS.some((p) => pathname.startsWith(p))) return ROUTES.projects
  if (pathname.startsWith(ROUTES.money)) return ROUTES.money
  return ROUTES.spaces
}
