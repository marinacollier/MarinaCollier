import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { flushNow, hydrate } from '@/data/store'
import { initAuth } from '@/integrations/auth'
import './index.css'

// A new deploy never loses a tick: the new version only takes over after the pending save reached the
// device (her data lives in IndexedDB, which a deploy does not touch; the seed migration is additive).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // If the save failed, stay on this version (the save-failed banner is showing) instead of reloading.
    flushNow().then(
      () => updateSW(true),
      () => undefined,
    )
  },
})

// Ask the browser not to evict our IndexedDB under storage pressure (best effort).
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void hydrate()
void initAuth()
