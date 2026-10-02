import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarSync, Download, Upload } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { ListCard, ListRow, SectionTitle } from '@/components/ui'
import { actions, getDB, useDB } from '@/data/store'
import type { ProviderId } from '@/data/types'
import { importICSText, toICS } from '@/integrations/ics'
import type { SyncReport } from '@/integrations/types'
import { pluralize } from '@/lib/text'
import { localEvents } from './selectors'
import { Toggle } from './ui'

const PROVIDER_LABEL: Partial<Record<ProviderId, string>> = {
  local: 'neste app',
  google: 'Google Calendar',
  microsoft: 'Outlook / Microsoft 365',
  ics: 'arquivo .ics',
  toki: 'Toki',
  apple: 'Apple',
}

export function reportMessage(r: SyncReport): string {
  const imported = r.created + r.updated
  if (!imported && !r.unchanged && !r.conflicts) return 'Nenhum evento encontrado nesse arquivo'
  const parts = [`${pluralize(imported, 'evento importado', 'eventos importados')}`]
  if (r.unchanged) parts.push(`${r.unchanged} já ${r.unchanged === 1 ? 'existia' : 'existiam'}`)
  if (r.conflicts) parts.push(`${pluralize(r.conflicts, 'possível duplicado', 'possíveis duplicados')} pra revisar`)
  return parts.join(', ')
}

/** Calendars: enable/disable sources, import/export .ics, link to integrations. */
export function SourcesPanel() {
  const sources = useDB((db) => db.calendarSources)
  const fileRef = useRef<HTMLInputElement>(null)
  const nav = useNavigate()

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await file.text()
      const report = importICSText(text, file.name.replace(/\.ics$/i, ''))
      toast(reportMessage(report))
    } catch {
      toast('Não consegui ler esse arquivo. Tenta exportar o .ics de novo?')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onExport = () => {
    const events = localEvents(getDB())
    if (!events.length) {
      toast('Ainda não tem compromissos daqui pra exportar')
      return
    }
    const blob = new Blob([toICS(events)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'marina-os.ics'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast(`${pluralize(events.length, 'compromisso exportado', 'compromissos exportados')} 📤`)
  }

  return (
    <section>
      <SectionTitle>calendários</SectionTitle>
      <ListCard>
        {sources.map((s) => (
          <ListRow
            key={s.id}
            leading={<span className="h-3 w-3 rounded-full ring-2 ring-surface-2" style={{ background: s.color }} aria-hidden />}
            title={s.name}
            subtitle={PROVIDER_LABEL[s.provider] ?? s.provider}
            trailing={
              <Toggle
                checked={s.enabled}
                label={`Mostrar ${s.name}`}
                onChange={(v) => actions.update('calendarSources', s.id, { enabled: v })}
              />
            }
          />
        ))}
        <ListRow leading={<Upload size={18} className="text-ink-2" />} title="Importar arquivo .ics" subtitle="do Google, Outlook, Apple, Toki…" onPress={() => fileRef.current?.click()} />
        <ListRow leading={<Download size={18} className="text-ink-2" />} title="Exportar .ics" subtitle="compromissos criados aqui" onPress={onExport} />
        <ListRow
          leading={<CalendarSync size={18} className="text-ink-2" />}
          title="Google Calendar, Outlook, Toki…"
          subtitle="conectar e sincronizar"
          chevron
          onPress={() => nav(ROUTES.integrations)}
        />
      </ListCard>
      <input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
    </section>
  )
}
