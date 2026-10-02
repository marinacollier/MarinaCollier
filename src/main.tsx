import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { hydrate } from '@/data/store'
import './index.css'

registerSW({ immediate: true })

// Ask the browser not to evict our IndexedDB under storage pressure (best effort).
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void hydrate()
