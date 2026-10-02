import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from '@/data/store'
import { routeTable } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { useTheme } from '@/app/useTheme'
import { BottomNav } from '@/components/layout/BottomNav'
import { Fab } from '@/components/layout/Fab'
import { SheetHost } from '@/components/layout/SheetHost'
import { Toaster } from '@/components/ui/Toaster'

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

  if (!hydrated) return <Splash />

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<div className="min-h-dvh" />}>
        <Routes>
          {routeTable.map(({ path, Component }) => (
            <Route key={path} path={path} element={<Component />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Fab />
      <BottomNav />
      <SheetHost />
      <Toaster />
      {!onboarded && (
        <Suspense fallback={null}>
          <Welcome />
        </Suspense>
      )}
    </BrowserRouter>
  )
}
