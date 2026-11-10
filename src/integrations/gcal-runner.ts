/**
 * When the Google Calendar sync runs: on open (after the app's own cloud data arrived, so nothing local
 * races the cloud), every 15 minutes while open, when she comes back to the app (>5 min), and on
 * "Sincronizar agora". Status is honest: "desconectado" whenever the connector can't be reached here.
 */
import { create } from 'zustand'
import { useCloudSync, artifactActive } from '@/data/sync'
import { todayKey } from '@/lib/date'
import { syncGoogleCalendar, type GcalStatus, type McpLike } from './notion-calendar'

export const useGcal = create<GcalStatus>(() => ({ state: 'desconectado', message: 'Verificando a conexão…' }))

const EVERY_MS = 15 * 60_000
let mcpPending: Promise<McpLike | null> | undefined
let started = false
let running = false

function getMcp(timeoutMs = 12_000): Promise<McpLike | null> {
  return (mcpPending ??= (async () => {
    const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude
    if (!c || typeof c.use !== 'function') return null
    try {
      const m = await Promise.race([c.use('mcp'), new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))])
      return m && typeof (m as McpLike).callTool === 'function' ? (m as McpLike) : null
    } catch {
      return null
    }
  })())
}

const NO_MCP = 'Sem acesso a conectores neste modo de abrir o app. Abra o MARINA OS pelo claude.ai (iPhone ou computador) com o conector Notion ligado ao teu Google.'

/** One sync now (also the "Sincronizar agora" button). */
export async function syncGoogleNow(): Promise<GcalStatus> {
  const mcp = await getMcp()
  if (!mcp) {
    useGcal.setState({ state: 'desconectado', message: NO_MCP, report: undefined })
    return useGcal.getState()
  }
  if (running) return useGcal.getState()
  running = true
  const prev = useGcal.getState()
  useGcal.setState({ ...prev, state: 'sincronizando' })
  try {
    const r = await syncGoogleCalendar(mcp, todayKey())
    useGcal.setState(r.state === 'conectado' ? r : { ...r, lastSync: prev.lastSync })
  } finally {
    running = false
  }
  return useGcal.getState()
}

/** Wait until the app's own cloud copy has been read (artifact db), at most ~20 s. */
function cloudSettled(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      unsub()
      clearTimeout(t)
      resolve()
    }
    const ok = () => !artifactActive() || useCloudSync.getState().status === 'synced'
    const unsub = useCloudSync.subscribe(() => ok() && done())
    const t = setTimeout(done, 20_000)
    if (ok()) setTimeout(done, 1500)
  })
}

export function initGoogleSync(): void {
  if (started || typeof window === 'undefined') return
  started = true
  void getMcp().then(async (mcp) => {
    if (!mcp) {
      useGcal.setState({ state: 'desconectado', message: NO_MCP })
      return
    }
    await cloudSettled()
    void syncGoogleNow()
    setInterval(() => void syncGoogleNow(), EVERY_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      const last = useGcal.getState().lastSync
      if (!last || Date.now() - Date.parse(last) > 5 * 60_000) void syncGoogleNow()
    })
  })
}
