import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Check, Minus, Plus } from 'lucide-react'
import { useDB } from '@/data/store'
import type { DateKey, Workout } from '@/data/types'
import { checkinFor, modalityOf, workoutsOn } from '@/data/selectors'
import { openSheet } from '@/app/ui-store'
import { Button, Card, CardHeader, IconButton, ItemList, ItemRow, SectionTitle, tone } from '@/components/ui'
import { addDays, relativeDay } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { FEELINGS, FOOD_TAGS, HABIT_ROWS, MEAL_SLOTS } from './constants'
import { CheckinFields, ModalityIcon, PlanTypeTag, StatusPill, whenLabel } from './components'
import { setHabits } from './mutations'
import { formatKm, formatMinutes, isDone, mealsBySlot } from './selectors'

const fade = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.04 * i, duration: 0.3 } })

export default function TodayTab({ today }: { today: DateKey }) {
  const db = useDB()
  const workouts = useMemo(() => workoutsOn(db, today), [db, today])
  const next = useMemo(
    () => db.workouts.filter((w) => w.date > today && w.date <= addDays(today, 7) && w.status === 'planejado').sort((a, b) => a.date.localeCompare(b.date))[0],
    [db.workouts, today],
  )
  const meals = useMemo(() => mealsBySlot(db.meals, today), [db.meals, today])
  const checkin = useMemo(() => checkinFor(db, today), [db, today])

  return (
    <div>
      <SectionTitle className="mt-0">Treino de hoje</SectionTitle>
      <div className="space-y-3">
        {workouts.map((w, i) => (
          <motion.div key={w.id} {...fade(i)}>
            {w.status === 'descanso' ? <RestCard workout={w} /> : <WorkoutCard workout={w} />}
          </motion.div>
        ))}
        {!workouts.length && (
          <Card className="flex items-center gap-4">
            <span className="text-[30px]" aria-hidden>
              🌿
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-display text-[19px] leading-tight">Nada planejado hoje</div>
              <div className="text-[13px] text-muted mt-0.5">
                {next ? `Próximo: ${modalityOf(db, next.modality).label.toLowerCase()} ${relativeDay(next.date, today)}` : 'Movimento leve também conta.'}
              </div>
            </div>
            <Button size="sm" variant="soft" icon={<Plus size={15} />} onClick={() => openSheet('workout', { date: today })}>
              treino
            </Button>
          </Card>
        )}
      </div>

      <SectionTitle>Comida de hoje</SectionTitle>
      <ItemList label="Comida de hoje">
        {MEAL_SLOTS.map(({ slot, label, emoji }) => {
          const list = meals[slot] ?? []
          const tags = [...new Set(list.flatMap((m) => m.tags))]
          const tagEmoji = FOOD_TAGS.filter((t) => tags.includes(t.value)).map((t) => t.emoji).join('')
          return (
            <ItemRow
              key={slot}
              title={list.length ? list.map((m) => m.description).join(' · ') : `${emoji} ${label}`}
              meta={list.length ? `${emoji} ${label}${tagEmoji ? ` ${tagEmoji}` : ''}` : '+ registrar'}
              onOpen={() => (list.length === 1 ? openSheet('meal', { id: list[0].id }) : openSheet('meal', { date: today, slot }))}
              trailing={
                list.length > 0 ? (
                  <IconButton label={`Adicionar em ${label}`} size="sm" onClick={() => openSheet('meal', { date: today, slot })}>
                    <Plus size={16} />
                  </IconButton>
                ) : undefined
              }
            />
          )
        })}
      </ItemList>

      <SectionTitle>Hábitos simples</SectionTitle>
      <HabitsCard date={today} />

      <SectionTitle>Check-in rápido</SectionTitle>
      <Card>
        <CardHeader eyebrow="como você está?" title={checkin && (checkin.energia || checkin.sono || checkin.humor) ? 'Anotado, obrigada 🌿' : 'Um toque já basta'} />
        <CheckinFields key={checkin?.id ?? 'new'} date={today} checkin={checkin} />
      </Card>
    </div>
  )
}

function WorkoutCard({ workout: w }: { workout: Workout }) {
  const db = useDB()
  const m = modalityOf(db, w.modality)
  const t = tone(m.tone)
  const done = isDone(w)
  const meta = [whenLabel(w), w.plannedDurationMin && formatMinutes(w.plannedDurationMin), w.intensity].filter(Boolean).join(' · ')
  const feeling = FEELINGS.find((f) => f.value === w.feeling)
  return (
    <div className="card overflow-hidden">
      <button type="button" className="w-full text-left p-4 pb-3 flex gap-4" onClick={() => openSheet('workout', { id: w.id })}>
        <ModalityIcon modality={m} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="eyebrow truncate">
              {meta || 'quando der'}
              {w.planType && <PlanTypeTag planType={w.planType} className="ml-2 align-middle" />}
            </div>
            <StatusPill status={w.status} className="-mt-0.5" />
          </div>
          <div className="font-display text-[24px] leading-[1.1] mt-1">{w.title || m.label}</div>
          {w.goal && <div className={cn('text-[14px] mt-1', t.text)}>{w.goal}</div>}
        </div>
      </button>
      {w.notes && <p className="px-4 -mt-1 pb-3 text-[13.5px] text-muted leading-relaxed">{w.notes}</p>}
      <div className="px-4 pb-2.5 -mt-1 flex items-center gap-2">
        {w.isKeySession && <span className="text-[12px] font-semibold tracking-[0.06em] text-accent">🔥 KEY SESSION</span>}
        <button type="button" className="ml-auto h-9 px-3 rounded-full bg-surface-2 text-[13px] text-ink-2 active:bg-line" onClick={() => openSheet('fuel', { workoutId: w.id })}>
          🍽️ Ver estratégia
        </button>
      </div>
      <div className="px-4 pb-4">
        {done ? (
          <button
            type="button"
            onClick={() => openSheet('workoutLog', { id: w.id })}
            className="w-full flex items-center gap-2 rounded-2xl bg-sage-soft px-4 h-12 text-[14px] text-ink-2"
          >
            <Check size={16} className="text-sage" />
            <span className="flex-1 text-left truncate">
              {[w.status === 'adaptado' ? 'adaptado' : 'feito', w.durationMin && formatMinutes(w.durationMin), w.distanceKm && formatKm(w.distanceKm)].filter(Boolean).join(' · ')}
            </span>
            {feeling && <span className="text-[18px]">{feeling.emoji}</span>}
          </button>
        ) : (
          <Button variant="primary" block className="h-12" icon={<Check size={17} />} onClick={() => openSheet('workoutLog', { id: w.id })}>
            Registrar
          </Button>
        )}
      </div>
    </div>
  )
}

function RestCard({ workout: w }: { workout: Workout }) {
  return (
    <Card onPress={() => openSheet('workout', { id: w.id })} className="flex items-center gap-4 bg-ocean-soft border-transparent">
      <span className="h-16 w-16 rounded-[22px] bg-surface/60 inline-flex items-center justify-center text-[32px]" aria-hidden>
        😴
      </span>
      <div className="min-w-0">
        <div className="eyebrow">dia de descanso</div>
        <div className="font-display text-[22px] leading-tight mt-0.5">{w.title ?? 'Recuperar também é treino'}</div>
        {w.notes && <div className="text-[13px] text-ink-2 mt-1">{w.notes}</div>}
      </div>
    </Card>
  )
}

function HabitsCard({ date }: { date: DateKey }) {
  const db = useDB()
  const c = useMemo(() => checkinFor(db, date), [db, date])
  const goal = Math.max(1, db.profile.waterGoal || 8)
  const agua = c?.habits.agua ?? 0
  const drops = Math.min(goal, 12)
  const setAgua = (n: number) => {
    const v = Math.max(0, n)
    if (v > agua) haptic(v === goal ? 'success' : 'light')
    setHabits(date, { agua: v })
  }
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="eyebrow">água</div>
          <div className="font-display text-[22px] leading-tight mt-0.5">
            {agua} <span className="text-muted text-[16px]">de {goal} copos</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Menos um copo" variant="soft" size="sm" onClick={() => setAgua(agua - 1)} disabled={!agua} className="disabled:opacity-40">
            <Minus size={16} />
          </IconButton>
          <IconButton label="Mais um copo" variant="primary" onClick={() => setAgua(agua + 1)}>
            <Plus size={18} />
          </IconButton>
        </div>
      </div>
      <div className="flex gap-1.5 mt-3" aria-hidden>
        {Array.from({ length: drops }, (_, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            onClick={() => setAgua(agua === i + 1 ? i : i + 1)}
            className={cn('flex-1 h-8 rounded-full transition-colors', i < agua ? 'bg-ocean' : 'bg-surface-2')}
          />
        ))}
      </div>
      <ItemList className="mt-3" label="Hábitos">
        {HABIT_ROWS.filter((h) => h.key !== 'agua').map((h) => {
          const on = !!c?.habits[h.key]
          return (
            <ItemRow
              key={h.key}
              title={`${h.emoji} ${h.label}`}
              checked={on}
              onCheck={(v) => {
                if (v) haptic('light')
                setHabits(date, { [h.key]: v })
              }}
            />
          )
        })}
      </ItemList>
    </Card>
  )
}
