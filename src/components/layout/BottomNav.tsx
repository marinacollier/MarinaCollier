import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { activeTab, TABS } from './nav'

export function BottomNav() {
  const { pathname } = useLocation()
  const current = activeTab(pathname)
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-bg/85 backdrop-blur-xl border-t border-line/70"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegação principal"
    >
      <div className="mx-auto max-w-[640px] grid grid-cols-3 h-[60px]">
        {TABS.map(({ to, label, icon: Icon }) => {
          const isActive = current === to
          return (
            <NavLink key={to} to={to} aria-current={isActive ? 'page' : undefined} className="relative flex flex-col items-center justify-center gap-0.5">
              <Icon size={22} strokeWidth={isActive ? 2.1 : 1.6} className={cn('transition-colors', isActive ? 'text-ink' : 'text-muted')} />
              <span className={cn('text-[10.5px] tracking-wide transition-colors', isActive ? 'text-ink font-semibold' : 'text-muted')}>{label}</span>
              {isActive && <motion.span layoutId="nav-dot" className="absolute top-1.5 h-1 w-1 rounded-full bg-accent" />}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
