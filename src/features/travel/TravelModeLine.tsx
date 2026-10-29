/**
 * Trip page: "Modo viagem ativo: rotina de SP pausada até 16/11" + a switch to turn it off for this trip.
 * Turning it back on also drops untouched template workouts on the trip's days (same rule as at boot).
 */
import type { Trip, Workout } from '@/data/types'
import { actions, getDB } from '@/data/store'
import { toast } from '@/app/ui-store'
import { travelModeApplies, travelModeLine, travelPrunableWorkouts } from '@/data/travel-mode'
import { Toggle } from '@/features/agenda/ui'

export function setTravelMode(trip: Trip, on: boolean): { removed: Workout[] } {
  const prev = trip.pauseHomeRoutine
  actions.update('trips', trip.id, { pauseHomeRoutine: on })
  const removed = on ? travelPrunableWorkouts(getDB()).filter((w) => !!trip.startDate && w.date >= trip.startDate && w.date <= (trip.endDate ?? trip.startDate)) : []
  for (const w of removed) actions.remove('workouts', w.id)
  toast(on ? 'Modo viagem ligado: rotina de SP pausada nestas datas' : 'Modo viagem desligado: rotina de SP segue normal', {
    action: {
      label: 'Desfazer',
      run: () => {
        actions.update('trips', trip.id, { pauseHomeRoutine: prev })
        for (const w of removed) actions.restore('workouts', w)
      },
    },
  })
  return { removed }
}

export function TravelModeLine({ trip }: { trip: Trip }) {
  if (!travelModeApplies(trip)) return null
  const on = trip.pauseHomeRoutine !== false
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface-2 px-4 min-h-11 py-2">
      <span aria-hidden>🧳</span>
      <span className="flex-1 min-w-0 text-[13.5px] text-ink-2">{travelModeLine(trip)}</span>
      <Toggle checked={on} onChange={(v) => setTravelMode(trip, v)} label="Modo viagem: pausar a rotina de São Paulo nesta viagem" />
    </div>
  )
}
