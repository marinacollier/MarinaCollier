/**
 * Google Calendar status — honest: "conectado · sincronizado 09:42 · 3 atualizados" or "desconectado" with
 * the reason. "Sincronizar agora" runs a real read (never a simulated success).
 */
import { RefreshCw } from 'lucide-react'
import { useGcal, syncGoogleNow } from '@/integrations/gcal-runner'
import { cn } from '@/lib/cn'

const hm = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function GcalStatusLine({ compact }: { compact?: boolean }) {
  const s = useGcal()
  const r = s.report
  const changes = r ? [r.created && `${r.created} novos`, r.updated && `${r.updated} atualizados`, r.deleted && `${r.deleted} cancelados`, r.adopted && `${r.adopted} já existiam (vinculados)`].filter(Boolean).join(' · ') : ''
  const label =
    s.state === 'sincronizando'
      ? 'Google Calendar · sincronizando…'
      : s.state === 'conectado'
        ? `Google Calendar · sincronizado ${hm(s.lastSync)}${changes ? ` · ${changes}` : ''}`
        : s.state === 'erro'
          ? `Google Calendar · erro${s.lastSync ? ` (último ok ${hm(s.lastSync)})` : ''}`
          : 'Google Calendar · desconectado'
  return (
    <div role="status" aria-label="Google Calendar" className={cn('flex items-start gap-2 text-[12.5px]', compact ? 'text-muted' : 'text-ink-2')}>
      <span aria-hidden className={cn('mt-[5px] h-1.5 w-1.5 rounded-full shrink-0', s.state === 'conectado' ? 'bg-sage' : s.state === 'erro' ? 'bg-plum' : s.state === 'sincronizando' ? 'bg-ocean' : 'bg-line')} />
      <span className="flex-1 min-w-0">
        {label}
        {!compact && s.message && s.state !== 'conectado' && <span className="block text-muted">{s.message}</span>}
      </span>
      <button type="button" onClick={() => void syncGoogleNow()} disabled={s.state === 'sincronizando'} aria-label="Sincronizar agora" className="h-7 px-2 -my-1 rounded-full inline-flex items-center gap-1 bg-surface-2 text-ink-2 active:opacity-70 disabled:opacity-50">
        <RefreshCw size={12} aria-hidden className={cn(s.state === 'sincronizando' && 'animate-spin')} />
        {!compact && 'Sincronizar agora'}
      </button>
    </div>
  )
}
