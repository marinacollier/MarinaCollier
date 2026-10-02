import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { CalendarPlus } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { IconButton, Page, PageHeader, Segmented } from '@/components/ui'
import { useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { useNow } from '@/hooks/useToday'
import { addDays, formatLongDate, hmToMinutes, inMinutesLabel, isDateKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { DayStrip } from './DayStrip'
import { entryRange } from './layout'
import { DayView } from './DayView'
import { UpcomingView, WeekView } from './ListViews'
import { dayEntries, timedOnly } from './selectors'
import { SourcesPanel } from './SourcesPanel'

type View = 'hoje' | 'dia' | 'semana' | 'agenda'
const VIEWS: { value: View; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'dia', label: 'Dia' },
  { value: 'semana', label: 'Semana' },
  { value: 'agenda', label: 'Agenda' },
]

export default function AgendaPage() {
  const { today, minutes } = useNow()
  const [params, setParams] = useSearchParams()
  const view = (VIEWS.some((v) => v.value === params.get('v')) ? params.get('v') : 'hoje') as View
  const dParam = params.get('d')
  const date: DateKey = isDateKey(dParam) ? dParam : today

  const set = (patch: { v?: View; d?: DateKey }) => {
    const next = new URLSearchParams(params)
    if (patch.v) next.set('v', patch.v)
    if (patch.d) next.set('d', patch.d)
    if (next.get('v') === 'hoje') next.delete('v')
    if (next.get('d') === today) next.delete('d')
    setParams(next, { replace: true })
  }

  const db = useDB()
  const subtitle = useMemo(() => {
    const timed = timedOnly(dayEntries(db, today))
    const phrase: Record<string, string> = { manhã: 'de manhã', almoço: 'no almoço', tarde: 'à tarde', noite: 'à noite' }
    const when = (e: (typeof timed)[number]) => (e.approx ? (phrase[e.periodLabel ?? ''] ?? e.periodLabel) : e.time)
    const next = timed.find((e) => hmToMinutes(e.time!) >= minutes && !e.done)
    const current = timed.find((e) => {
      const r = entryRange(e)
      return !e.approx && r.start <= minutes && minutes < r.end && !e.done
    })
    if (current) return `agora: ${current.title}${next ? ` · depois, ${when(next)} ${next.title}` : ''}`
    if (next) {
      const dist = hmToMinutes(next.time!) - minutes
      return `próximo: ${when(next)} ${next.title}${dist <= 180 && !next.approx ? ` · ${inMinutesLabel(dist)}` : ''}`
    }
    if (timed.length) return 'compromissos de hoje feitos ✨'
    return 'dia livre de compromissos'
  }, [db, today, minutes])

  const onPanEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 70 || Math.abs(info.offset.x) < Math.abs(info.offset.y) * 1.6) return
    haptic('light')
    set({ d: addDays(date, info.offset.x < 0 ? 1 : -1) })
  }

  return (
    <Page>
      <PageHeader
        eyebrow={formatLongDate(today)}
        title="Agenda"
        subtitle={subtitle}
        actions={
          <IconButton label="Novo compromisso" onClick={() => openSheet('event', { date: view === 'hoje' || view === 'agenda' ? today : date })}>
            <CalendarPlus size={20} />
          </IconButton>
        }
      />

      <div className="sticky top-0 z-20 -mx-4 px-4 pb-3 pt-[max(env(safe-area-inset-top),8px)] bg-bg/90 backdrop-blur-md">
        <Segmented value={view} onChange={(v) => set({ v, d: v === 'hoje' ? today : date })} options={VIEWS} />
        {view === 'dia' && (
          <div className="mt-3">
            <DayStrip date={date} today={today} onChange={(d) => set({ d })} />
          </div>
        )}
      </div>

      <div className="mt-2">
        {view === 'hoje' && <DayView date={today} today={today} nowMinutes={minutes} autoScroll />}
        {view === 'dia' && (
          <motion.div onPanEnd={onPanEnd} style={{ touchAction: 'pan-y' }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={date} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.16 }}>
                <DayView date={date} today={today} nowMinutes={minutes} autoScroll />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
        {view === 'semana' && <WeekView date={date} today={today} onDate={(d) => set({ d })} onOpenDay={(d) => set({ v: 'dia', d })} />}
        {view === 'agenda' && <UpcomingView today={today} onOpenDay={(d) => set({ v: 'dia', d })} />}
      </div>

      <div className="mt-6">
        <SourcesPanel />
      </div>
    </Page>
  )
}
