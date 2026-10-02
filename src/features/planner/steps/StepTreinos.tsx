import { useMemo } from 'react'
import { Checkbox, Chip, EmptyState } from '@/components/ui'
import type { WorkoutGoal } from '@/data/types'
import { modalityGroup, PERIOD_LABEL } from '@/data/planning'
import { WEEKDAY_SHORT, weekday } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { toast } from '@/app/ui-store'
import { existingWorkouts, flexPlannedCount, flexibleGoals, flexSuggestions, modalityLabel, pickFor, plannedSummaryLine, plannedWorkouts, type TrainingLine } from '../plan'
import { dayName, DayHeader, Eyebrow, Group, PlanTag, Quiet, Row } from '../ui'
import type { StepProps } from './types'

export function StepTreinos(props: StepProps) {
  const { db, today, weekStart, days, draft, setDraft, lines, planned } = props
  const existing = useMemo(() => existingWorkouts(db, weekStart), [db, weekStart])
  const goals = useMemo(() => flexibleGoals(db), [db])
  // Suggestions consider the template choices, not the flexible picks themselves (keeps options stable).
  const templateOnly = useMemo(() => plannedWorkouts(db, { ...draft, flex: [] }, lines), [db, draft, lines])
  const summary = useMemo(() => plannedSummaryLine(db, weekStart, planned), [db, weekStart, planned])

  const setPick = (line: TrainingLine, v: string | null) => {
    if (v) haptic('light')
    setDraft((d) => ({ ...d, picks: { ...d.picks, [line.templateId]: v } }))
  }

  const toggleFlex = (goal: WorkoutGoal, date: string, time: string) => {
    setDraft((d) => {
      const has = d.flex.some((f) => f.goalId === goal.id && f.date === date)
      if (has) return { ...d, flex: d.flex.filter((f) => !(f.goalId === goal.id && f.date === date)) }
      const mine = d.flex.filter((f) => f.goalId === goal.id).length
      const room = (goal.perWeek ?? 1) - flexPlannedCount(db, goal, weekStart)
      if (mine >= room) {
        toast(`${goal.title}: ${goal.perWeek}x já tá bom 😉`)
        return d
      }
      haptic('light')
      return { ...d, flex: [...d.flex, { goalId: goal.id, date, time, durationMin: 60 }] }
    })
  }

  const hasAnything = lines.length > 0 || existing.length > 0 || goals.length > 0

  return (
    <div>
      {!hasAnything && (
        <EmptyState emoji="🏃‍♀️" title="Sem modelo de semana ainda" text="Quando você montar seu modelo de treinos em Corpo, ele aparece aqui pra escolher." />
      )}

      {days.map((date) => {
        const dayLines = lines.filter((l) => l.date === date)
        const dayExisting = existing.filter((w) => w.date === date)
        if (!dayLines.length && !dayExisting.length) return null
        return (
          <section key={date}>
            <DayHeader date={date} today={today} />
            <Group>
              {dayExisting.map((w) => {
                const m = modalityLabel(db, w.modality)
                return (
                  <Row
                    key={w.id}
                    emoji={w.status === 'descanso' ? '🌿' : m.emoji}
                    title={w.title || (w.status === 'descanso' ? 'Descanso' : m.label)}
                    time={w.time ?? (w.period ? PERIOD_LABEL[w.period] : undefined)}
                    detail="já no plano"
                    muted
                  />
                )
              })}
              {dayLines.map((line) => (
                <LineRow key={line.templateId} line={line} pick={pickFor(draft, line)} onPick={(v) => setPick(line, v)} {...props} />
              ))}
            </Group>
          </section>
        )
      })}

      {goals.length > 0 && (
        <>
          <Eyebrow className="mt-8">Do jeito que der</Eyebrow>
          <div className="space-y-2.5">
            {goals.map((g) => {
              const already = flexPlannedCount(db, g, weekStart)
              const per = g.perWeek ?? 1
              const fun = g.obligation === false
              const m = modalityLabel(db, g.modality!)
              const sugg = already >= per ? [] : flexSuggestions(db, g, weekStart, today, templateOnly)
              return (
                <div key={g.id} className="card p-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[18px]" aria-hidden>
                      {m.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] leading-snug">
                        {g.title} <span className="text-muted">· {per}x/semana</span>
                      </div>
                      <div className="text-[12.5px] text-muted">{fun ? 'diversão, se der vontade — nunca obrigação' : already >= per ? 'já tem na semana ✓' : 'escolhe uma janela, se quiser'}</div>
                    </div>
                    <PlanTag type={g.planType ?? 'flexivel'} />
                  </div>
                  {sugg.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {sugg.map((s) => {
                        const on = draft.flex.some((f) => f.goalId === g.id && f.date === s.date)
                        return (
                          <Chip key={s.date} selected={on} onClick={() => toggleFlex(g, s.date, s.start)}>
                            {WEEKDAY_SHORT[weekday(s.date)].toLowerCase()} {s.start}
                          </Chip>
                        )
                      })}
                    </div>
                  )}
                  {sugg.length > 0 && <div className="text-[12px] text-muted mt-2">{sugg[0].reason === 'dia que você costuma preferir' ? `${dayName(sugg[0].date)} é o dia que você costuma preferir.` : 'Janelas livres que respeitam trabalho e check-ins.'}</div>}
                </div>
              )
            })}
          </div>
        </>
      )}

      {summary && (
        <div className="mt-6 rounded-2xl bg-surface-2 px-4 py-3">
          <div className="eyebrow">Meu treino da semana</div>
          <div className="text-[15px] mt-1">{summary}</div>
        </div>
      )}
      <Quiet className="mt-3">Mudar de ideia no meio da semana é normal. Dá pra arrastar treino pra outro dia depois.</Quiet>
    </div>
  )
}

function LineRow({ line, pick, onPick, db }: StepProps & { line: TrainingLine; pick: string | null; onPick: (v: string | null) => void }) {
  if (line.choice === 'fixed' || line.choice === 'rest') {
    const rest = line.choice === 'rest'
    const m = modalityLabel(db, line.options[0] ?? 'outro')
    return (
      <Row
        emoji={rest ? '🌿' : m.emoji}
        title={
          <span className="inline-flex items-center gap-2 flex-wrap">
            {line.title || (rest ? 'Descanso' : m.label)} <PlanTag type={line.planType} />
          </span>
        }
        time={line.time ?? (line.period ? PERIOD_LABEL[line.period] : undefined)}
        detail={line.notes}
        muted={!pick}
        right={<Checkbox checked={!!pick} onChange={(v) => onPick(v ? line.options[0] : null)} label={`Incluir ${line.title || m.label}`} />}
      />
    )
  }
  const allFun = line.options.length > 1 && line.options.every((o) => modalityGroup(db.profile, o) === 'fun')
  const prompt =
    line.choice === 'optional'
      ? 'Se encaixar'
      : allFun
        ? `Escolha o que combina com seu ${dayName(line.date).toLowerCase()}`
        : line.options.map((o) => modalityLabel(db, o).label.toLowerCase()).join(' ou ')
  return (
    <div className="px-3.5 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[15px] leading-snug">{line.title || prompt}</span>
        <PlanTag type={line.planType} />
      </div>
      {(line.title || line.time || line.period || line.notes) && (
        <div className="text-[12.5px] text-muted mt-0.5">
          {[line.title ? prompt : undefined, line.time ?? (line.period ? PERIOD_LABEL[line.period] : undefined), line.notes].filter(Boolean).join(' · ')}
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-2.5">
        {line.options.map((o) => {
          const m = modalityLabel(db, o)
          return (
            <Chip key={o} selected={pick === o} onClick={() => onPick(pick === o ? null : o)}>
              <span aria-hidden>{m.emoji}</span> {m.label}
            </Chip>
          )
        })}
        {line.choice === 'one_of' && (
          <Chip selected={pick === null} onClick={() => onPick(null)}>
            {allFun ? 'Descanso' : 'Dessa vez não'}
          </Chip>
        )}
      </div>
    </div>
  )
}
