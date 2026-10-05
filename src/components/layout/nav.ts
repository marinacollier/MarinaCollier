import { CalendarDays, LayoutGrid, Sparkles } from 'lucide-react'
import { ROUTES } from '@/app/routes'

/**
 * Three places, nothing more: Início (Lumos + what matters now) · Agenda (how time is organized) ·
 * Espaços (where to find something specific). Settings live behind the avatar on Início.
 */
export const TABS = [
  { to: ROUTES.today, label: 'Início', icon: Sparkles, end: true },
  { to: ROUTES.agenda, label: 'Agenda', icon: CalendarDays },
  { to: ROUTES.spaces, label: 'Espaços', icon: LayoutGrid },
] as const

/** Pages reached from Espaços keep Espaços lit (Livros, Viagens, Trabalho…). */
export function activeTab(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/lumos')) return ROUTES.today
  if (pathname.startsWith(ROUTES.agenda) || pathname.startsWith(ROUTES.weekPlanner)) return ROUTES.agenda
  if (pathname.startsWith('/ajustes')) return ROUTES.today
  return ROUTES.spaces
}
