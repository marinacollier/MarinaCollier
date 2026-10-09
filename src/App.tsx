import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from '@/data/store'
import { ensureReceivables } from '@/data/finance/receivables'
import { todayKey } from '@/lib/date'
import { ROUTES, routeTable } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { useTheme } from '@/app/useTheme'
import { BottomNav } from '@/components/layout/BottomNav'
import { SaveFailedBanner } from '@/components/layout/SaveFailedBanner'
import { SheetHost } from '@/components/layout/SheetHost'
import { Toaster } from '@/components/ui/Toaster'
import { useLocalReminders } from '@/features/settings/useLocalReminders'

/** Preview builds run inside a sandboxed frame where URL routing isn't available. */
const Router = import.meta.env.VITE_PREVIEW === '1' ? MemoryRouter : BrowserRouter

const Welcome = lazy(() => import('@/features/settings/Welcome'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

function useCommandShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openSheet('commandPalette')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function Splash() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3">
      <div className="h-12 w-12 rounded-full bg-accent animate-pulse" />
      <div className="font-display text-xl">MARINA OS</div>
    </div>
  )
}

export default function App() {
  const hydrated = useStore((s) => s.hydrated)
  const onboarded = useStore((s) => !!s.db.profile.onboardedAt)
  useTheme()
  useCommandShortcut()
  useLocalReminders()
  // Contracts' monthly receivables exist as "previsto" (this month + next) — idempotent, never "recebido".
  useEffect(() => {
    if (hydrated) ensureReceivables(todayKey())
  }, [hydrated])

  if (!hydrated) return <Splash />

  return (
    <Router>
      <ScrollToTop />
      <Suspense fallback={<div className="min-h-dvh" />}>
        <Routes>
          {routeTable.map(({ path, Component }) => (
            <Route key={path} path={path} element={<Component />} />
          ))}
          {/* The assistant was called Mari before Lumos; old links keep working. */}
          <Route path="/mari" element={<Navigate to={ROUTES.assistant} replace />} />
          {/* "Mais" became Espaços (settings live behind the avatar on Início). */}
          <Route path={ROUTES.more} element={<Navigate to={ROUTES.spaces} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <BottomNav />
      <SheetHost />
      <Toaster />
      <SaveFailedBanner />
      {!onboarded && (
        <Suspense fallback={null}>
          <Welcome />
        </Suspense>
      )}
    </Router>
  )
}
