/**
 * The routine card on Hoje: Milagre da Manhã in the morning (and during the day while it's open),
 * "Encerrar o dia" at night. One compact card, expandable.
 */
import { useMemo } from 'react'
import { openSheet } from '@/app/ui-store'
import { actions, getDB } from '@/data/store'
import { eveningRoutine, morningRoutine, routineView } from '../routine'
import { RoutineCard } from './RoutineCard'
import { SoftAction, Widget, WidgetEmpty, type WidgetCtx } from './shared'

export { morningRoutine }

export function MorningWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today, part } = ctx
  const morning = morningRoutine(db)
  const evening = eveningRoutine(db)
  const morningDone = useMemo(() => (morning ? routineView(db, morning, today).complete : false), [db, morning, today])

  if (part === 'noite') {
    if (!evening?.active) return null
    return <RoutineCard db={db} routine={evening} date={today} widgetId="manha" tone="plum" doneToast="Dia encerrado 🌙" doneTitle="Dia encerrado 🌙" />
  }

  if (!morning) {
    return (
      <Widget id="manha" eyebrow="Rotina da manhã">
        <WidgetEmpty
          emoji="☀️"
          text="Uma rotina curtinha pra começar o dia do seu jeito."
          action={
            <SoftAction
              onClick={() => {
                const r = actions.create('routines', { name: 'Minha manhã', period: 'manha', emoji: '☀️', order: getDB().routines.length, active: true })
                openSheet('routineEditor', { routineId: r.id })
              }}
            >
              Criar
            </SoftAction>
          }
        />
      </Widget>
    )
  }
  if (!morning.active) return null
  // After the morning, a finished routine steps out of the way.
  if (part === 'dia' && morningDone) return null

  return <RoutineCard db={db} routine={morning} date={today} widgetId="manha" doneToast="Manhã feita ☀️" doneTitle="Manhã feita ☀️" />
}
