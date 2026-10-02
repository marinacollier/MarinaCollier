import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Briefcase, CalendarDays, Leaf, LayoutGrid, Sun } from 'lucide-react'
import { cn } from '@/lib/cn'

const TABS = [
  { to: '/', label: 'Hoje', icon: Sun, end: true },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/vida', label: 'Vida', icon: Leaf },
  { to: '/trabalho', label: 'Trabalho', icon: Briefcase },
  { to: '/mais', label: 'Mais', icon: LayoutGrid },
]

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-bg/85 backdrop-blur-xl border-t border-line/70"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegação principal"
    >
      <div className="mx-auto max-w-[640px] grid grid-cols-5 h-[60px]">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="relative flex flex-col items-center justify-center gap-0.5">
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.1 : 1.6} className={cn('transition-colors', isActive ? 'text-ink' : 'text-muted')} />
                <span className={cn('text-[10.5px] tracking-wide transition-colors', isActive ? 'text-ink font-semibold' : 'text-muted')}>{label}</span>
                {isActive && <motion.span layoutId="nav-dot" className="absolute top-1.5 h-1 w-1 rounded-full bg-accent" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
