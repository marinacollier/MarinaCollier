import { useEffect } from 'react'
import { useDB } from '@/data/store'

/** Applies profile.theme to <html> and mirrors it to localStorage so index.html can avoid a flash. */
export function useTheme(): void {
  const theme = useDB((db) => db.profile.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#131611' : '#ecebe4'))
    }
    apply()
    try {
      localStorage.setItem('marina-os-theme', JSON.stringify(theme))
    } catch {
      /* private mode */
    }
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}
