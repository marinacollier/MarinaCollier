import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Plus } from 'lucide-react'
import { useDB } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { Button, EmptyState, IconButton, Page, PageHeader, SectionTitle } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { Trip, TripItem } from '@/data/types'
import { Postcard, toneVars } from './Postcard'
import { checklistProgress, itemsOfTrip, nextChecklistItem, tripBuckets, tripCountdown, tripDatesLabel } from './selectors'

function HeroFooter({ trip, items }: { trip: Trip; items: TripItem[] }) {
  const mine = useMemo(() => itemsOfTrip(items, trip.id), [items, trip.id])
  const { done, total } = checklistProgress(mine)
  const next = nextChecklistItem(mine)
  if (!total) return <div className="text-[13px] text-ink-2">Abrir a viagem e começar o “antes de ir” ✨</div>
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <div className="min-w-0">
        <div className="eyebrow" style={{ color: 'var(--pc-ink)' }}>
          próximo passo
        </div>
        <div className="text-ink truncate mt-0.5">{next ? next.title : 'Tudo pronto pra ir 💛'}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display text-[20px] leading-none">
          {done}
          <span className="text-muted text-[14px]">/{total}</span>
        </div>
        <div className="text-[11px] text-muted mt-1">antes de ir</div>
      </div>
    </div>
  )
}

export default function TripsPage() {
  const trips = useDB((db) => db.trips)
  const items = useDB((db) => db.tripItems)
  const today = useToday()
  const nav = useNavigate()
  const [showPast, setShowPast] = useState(false)
  const b = useMemo(() => tripBuckets(trips, today), [trips, today])
  const open = (t: Trip) => nav(ROUTES.trip(t.id))

  return (
    <Page>
      <PageHeader
        back
        title="Viagens"
        subtitle="Próximas paradas, sonhos e memórias ✈️"
        actions={
          <IconButton label="Nova viagem" onClick={() => openSheet('trip')}>
            <Plus size={22} />
          </IconButton>
        }
      />

      {!trips.length && (
        <div className="card">
          <EmptyState
            emoji="🗺️"
            title="Pra onde a gente vai?"
            text="Começa com um nome — data, mala e roteiro vêm depois."
            action={<Button onClick={() => openSheet('trip')}>Nova viagem</Button>}
          />
        </div>
      )}

      {b.next && (
        <section aria-label="Próxima viagem">
          <Postcard
            variant="hero"
            trip={b.next}
            eyebrow="próxima parada"
            datesLabel={tripDatesLabel(b.next)}
            countdown={tripCountdown(b.next, today)}
            onPress={() => open(b.next!)}
            tilt={-0.6}
            footer={<HeroFooter trip={b.next} items={items} />}
          />
        </section>
      )}

      {b.upcoming.length > 0 && (
        <>
          <SectionTitle>Depois</SectionTitle>
          <div className="space-y-3.5">
            {b.upcoming.map((t, i) => (
              <Postcard
                key={t.id}
                trip={t}
                index={i + 1}
                tilt={i % 2 ? 0.7 : -0.5}
                datesLabel={tripDatesLabel(t)}
                countdown={tripCountdown(t, today)}
                onPress={() => open(t)}
              />
            ))}
          </div>
        </>
      )}

      {(trips.length > 0 || b.dreaming.length > 0) && (
        <>
          <SectionTitle>Sonhando</SectionTitle>
          {b.dreaming.length ? (
            <div className="grid grid-cols-2 gap-3">
              {b.dreaming.map((t, i) => (
                <motion.button
                  key={t.id}
                  type="button"
                  onClick={() => open(t)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, rotate: i % 2 ? 1 : -1 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  style={toneVars(t.tone)}
                  className="text-left rounded-[16px] border border-dashed p-3.5 bg-surface active:scale-[0.98] transition"
                >
                  <div className="text-[28px] leading-none">{t.flag || '✨'}</div>
                  <div className="font-display text-[18px] leading-tight mt-2 truncate">{t.name}</div>
                  <div className="text-[12px] text-muted mt-0.5 truncate">{t.dateLabel || t.place || 'um dia 💭'}</div>
                </motion.button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openSheet('trip')}
              className="w-full card border-dashed p-4 flex items-center gap-3 text-left active:scale-[0.99] transition"
            >
              <span className="text-2xl" aria-hidden>
                💭
              </span>
              <span className="min-w-0">
                <span className="block font-display text-[17px]">Algum lugar te chamando?</span>
                <span className="block text-[13px] text-muted">Guarda aqui como sonho, sem data e sem pressa.</span>
              </span>
            </button>
          )}
        </>
      )}

      {b.past.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowPast((s) => !s)}
            className="w-full flex items-center justify-between px-1 mt-7 mb-2.5 h-10"
            aria-expanded={showPast}
          >
            <span className="eyebrow">Memórias · {b.past.length}</span>
            <ChevronDown size={16} className={cn('text-muted transition-transform', showPast && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {showPast && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="card overflow-hidden divide-y divide-line/70">
                  {b.past.map((t) => (
                    <button key={t.id} type="button" onClick={() => open(t)} className="w-full flex items-center gap-3 px-4 min-h-[56px] text-left active:bg-surface-2">
                      <span className="text-2xl grayscale-[35%]">{t.flag}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] truncate">{t.name}</span>
                        <span className="block text-[12.5px] text-muted truncate">{tripDatesLabel(t)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {trips.length > 0 && (
        <div className="mt-8 flex justify-center">
          <Button variant="soft" icon={<Plus size={17} />} onClick={() => openSheet('trip')}>
            Nova viagem
          </Button>
        </div>
      )}
    </Page>
  )
}
