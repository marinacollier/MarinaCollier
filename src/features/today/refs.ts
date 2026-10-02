import type { DB, EntityType, ID } from '@/data/types'
import { modalityOf } from '@/data/selectors'

type SegmenterCtor = new (l?: string, o?: { granularity: 'grapheme' }) => { segment: (s: string) => Iterable<{ segment: string }> }

/** Last user-perceived character of a string (so typing a new emoji replaces the old one). */
export function lastGrapheme(s: string): string {
  if (!s) return ''
  const Seg = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter
  if (Seg) {
    const parts = [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)]
    return parts[parts.length - 1]?.segment ?? ''
  }
  return [...s].slice(-1).join('')
}

/** Short human label for what a priority points at (subtitle under the priority). */
export function refLabel(db: DB, ref?: { type: EntityType; id: ID }): string | undefined {
  if (!ref) return undefined
  switch (ref.type) {
    case 'task': {
      const t = db.tasks.find((x) => x.id === ref.id)
      if (!t) return undefined
      const p = t.projectId ? db.projects.find((x) => x.id === t.projectId) : undefined
      if (p) return `${p.emoji} ${p.name}`
      return t.context === 'trabalho' ? '💻 trabalho' : undefined
    }
    case 'project': {
      const p = db.projects.find((x) => x.id === ref.id)
      return p ? `${p.emoji} ${p.name} · próxima ação` : undefined
    }
    case 'studyItem':
      return '📚 estudo'
    case 'workout': {
      const w = db.workouts.find((x) => x.id === ref.id)
      if (!w) return '🏃‍♀️ treino'
      const m = modalityOf(db, w.modality)
      return `${m.emoji} treino${w.time ? ` · ${w.time}` : ''}`
    }
    case 'tripItem': {
      const it = db.tripItems.find((x) => x.id === ref.id)
      const trip = it ? db.trips.find((t) => t.id === it.tripId) : undefined
      return trip ? `${trip.flag} ${trip.name}` : '✈️ viagem'
    }
    default:
      return undefined
  }
}
