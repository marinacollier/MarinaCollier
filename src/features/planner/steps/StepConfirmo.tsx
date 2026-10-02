import { useMemo } from 'react'
import { PERIOD_LABEL } from '@/data/planning'
import { WEEKDAY_SHORT, weekday } from '@/lib/date'
import { confirmedPlan, modalityLabel, planConflicts, plannedSummaryLine, weekLoad, type PlanOps } from '../plan'
import { Eyebrow, Group, LoadStrip, Quiet, Row } from '../ui'
import type { StepProps } from './types'

const short = (d: string) => WEEKDAY_SHORT[weekday(d)].toLowerCase()

export function StepConfirmo({ db, today, weekStart, planned, ops }: StepProps & { ops: PlanOps }) {
  const summary = useMemo(() => plannedSummaryLine(db, weekStart, planned), [db, weekStart, planned])
  const open = useMemo(() => planConflicts(db, weekStart, today, planned).filter((c) => c.severity === 'warn').length, [db, weekStart, today, planned])
  const already = confirmedPlan(db, weekStart)
  const load = useMemo(() => weekLoad(db, weekStart, planned), [db, weekStart, planned])
  const workouts = [...ops.workouts].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
  const nothing = !workouts.length && !ops.goals.length && !ops.priorities.length

  return (
    <div>
      {summary && (
        <div className="rounded-2xl bg-sage-soft px-4 py-3.5">
          <div className="eyebrow text-sage">Meu treino da semana</div>
          <div className="font-display text-[19px] leading-snug mt-1">{summary}</div>
        </div>
      )}

      <div className="mt-4">
        <LoadStrip load={load} today={today} />
      </div>

      {workouts.length > 0 && (
        <>
          <Eyebrow>Treinos que entram</Eyebrow>
          <Group>
            {workouts.map((w) => {
              const m = modalityLabel(db, w.modality)
              const rest = w.status === 'descanso'
              return (
                <Row
                  key={w.id}
                  emoji={rest ? '🌿' : m.emoji}
                  title={`${w.title || (rest ? 'Descanso' : m.label)}${w.isKeySession ? ' 🔥' : ''}`}
                  time={short(w.date)}
                  detail={w.time ?? (w.period ? PERIOD_LABEL[w.period] : undefined)}
                />
              )
            })}
          </Group>
        </>
      )}

      {ops.goals.length > 0 && (
        <>
          <Eyebrow>Foco de estudo</Eyebrow>
          <Group>
            {ops.goals.map((g) => (
              <Row key={g.title} title={g.title} detail="meta da semana" />
            ))}
          </Group>
        </>
      )}

      {ops.priorities.length > 0 && (
        <>
          <Eyebrow>Top 3 de trabalho</Eyebrow>
          <Group>
            {ops.priorities.map((p) => (
              <Row key={`${p.date}:${p.title}`} emoji="🎯" title={p.title} time={short(p.date)} />
            ))}
          </Group>
        </>
      )}

      {nothing && (
        <div className="card p-4 text-[14px] text-ink-2 leading-snug">
          {already ? 'Essa semana já está montada. Confirmar de novo não duplica nada ✓' : 'Nada novo pra criar — tudo bem também. Dá pra confirmar assim mesmo e marcar a semana como montada.'}
        </div>
      )}

      {open > 0 && <Quiet className="mt-4">{open === 1 ? 'Ficou 1 ponto de atenção' : `Ficaram ${open} pontos de atenção`} — tudo bem, é só aviso.</Quiet>}
      {already && !nothing && <Quiet className="mt-3">Você já montou essa semana antes. Só o que é novo vai entrar — nada duplica.</Quiet>}
    </div>
  )
}
