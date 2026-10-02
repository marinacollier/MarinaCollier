import { useMemo, useRef, useState } from 'react'
import { Download, Link2, Upload } from 'lucide-react'
import { Button, TextInput } from '@/components/ui'
import { toast } from '@/app/ui-store'
import { useDB } from '@/data/store'
import { haptic } from '@/lib/haptics'
import { formatShortDate, toDateKey } from '@/lib/date'
import { pluralize } from '@/lib/text'
import { importICSText, toICS } from '@/integrations/ics'
import { importICSUrl } from '@/integrations/ics/remote'
import { isHiddenBySync } from '@/integrations/sync'
import type { SyncReport } from '@/integrations/types'

export function reportMessage(r: SyncReport): string {
  const parts: string[] = []
  if (r.created) parts.push(pluralize(r.created, 'novo', 'novos'))
  if (r.updated) parts.push(pluralize(r.updated, 'atualizado', 'atualizados'))
  if (r.deleted) parts.push(pluralize(r.deleted, 'saiu da agenda', 'saíram da agenda'))
  if (r.conflicts) parts.push(pluralize(r.conflicts, 'para você revisar', 'para você revisar'))
  return parts.length ? parts.join(' · ') : 'Tudo já estava em dia ✨'
}

/** Import (.ics file or subscription link) + export, all local except the link fetch. */
export function IcsTools({ backendReady }: { backendReady: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const sources = useDB((db) => db.calendarSources)
  const events = useDB((db) => db.events)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const icsSources = useMemo(
    () =>
      sources
        .filter((s) => s.provider === 'ics')
        .map((s) => ({ ...s, count: events.filter((e) => e.sourceId === s.id && !isHiddenBySync(e)).length })),
    [sources, events],
  )
  const exportable = useMemo(() => events.filter((e) => !isHiddenBySync(e)), [events])

  async function onFile(file: File) {
    try {
      const text = await file.text()
      const name = file.name.replace(/\.ics$/i, '').replace(/[_-]+/g, ' ').trim() || 'Agenda importada'
      const r = importICSText(text, name)
      haptic('success')
      toast(`${name}: ${reportMessage(r)}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não consegui ler esse arquivo')
    }
  }

  async function onUrl() {
    const link = url.trim()
    if (!link) return
    setBusy(true)
    try {
      const host = new URL(link.replace(/^webcal:/i, 'https:')).hostname.replace(/^www\./, '')
      const r = await importICSUrl(link, host)
      haptic('success')
      toast(reportMessage(r))
      setUrl('')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não consegui buscar esse link')
    } finally {
      setBusy(false)
    }
  }

  function onExport() {
    const blob = new Blob([toICS(exportable)], { type: 'text/calendar;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `marina-os-agenda-${toDateKey()}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    toast(`${pluralize(exportable.length, 'evento exportado', 'eventos exportados')} 📅`)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft" icon={<Upload size={17} />} onClick={() => fileRef.current?.click()}>
          Importar .ics
        </Button>
        <Button variant="soft" icon={<Download size={17} />} onClick={onExport} disabled={!exportable.length}>
          Exportar
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }}
      />

      {backendReady ? (
        <div className="flex gap-2">
          <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link webcal:// ou https://…ics" inputMode="url" className="flex-1 min-w-0" />
          <Button variant="outline" icon={<Link2 size={16} />} onClick={onUrl} disabled={busy || !url.trim()}>
            Assinar
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted">Assinar por link (webcal) precisa do servidor configurado — por arquivo funciona já.</p>
      )}

      {icsSources.length > 0 && (
        <ul className="rounded-2xl bg-surface-2 divide-y divide-line/70">
          {icsSources.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[14px]">
              <span className="truncate">{s.name}</span>
              <span className="text-[12.5px] text-muted shrink-0">
                {pluralize(s.count, 'evento', 'eventos')}
                {s.lastSync ? ` · ${formatShortDate(toDateKey(new Date(s.lastSync)))}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
