import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { activeTab, TABS } from './nav'

/** The five places: a bottom bar on the phone, a quiet rail on the left from tablet width up. */
export function BottomNav() {
  const { pathname } = useLocation()
  const current = activeTab(pathname)
  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg/85 backdrop-blur-xl border-t border-line/70"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Navegação principal"
      >
        <div className="mx-auto max-w-[640px] grid grid-cols-5 h-[60px]">
          {TABS.map(({ to, label, icon: Icon }) => {
            const isActive = current === to
            return (
              <NavLink key={to} to={to} aria-current={isActive ? 'page' : undefined} className="relative flex flex-col items-center justify-center gap-0.5 min-w-0">
                <Icon size={21} strokeWidth={isActive ? 2.1 : 1.6} className={cn('transition-colors', isActive ? 'text-ink' : 'text-muted')} />
                <span className={cn('text-[10.5px] tracking-wide transition-colors truncate max-w-full px-0.5', isActive ? 'text-ink font-semibold' : 'text-muted')}>{label}</span>
                {isActive && <motion.span layoutId="nav-dot" className="absolute top-1.5 h-1 w-1 rounded-full bg-accent" />}
              </NavLink>
            )
          })}
        </div>
      </nav>
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 w-[84px] flex-col items-center gap-1 pt-[max(env(safe-area-inset-top),20px)] border-r border-line/70 bg-bg/90 backdrop-blur-xl" aria-label="Navegação principal">
        {TABS.map(({ to, label, icon: Icon }) => {
          const isActive = current === to
          return (
            <NavLink
              key={to}
              to={to}
              aria-current={isActive ? 'page' : undefined}
              className={cn('w-[72px] min-h-[64px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors', isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink')}
            >
              <Icon size={21} strokeWidth={isActive ? 2.1 : 1.6} />
              <span className={cn('text-[11px] leading-tight text-center', isActive && 'font-semibold')}>{label}</span>
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}
