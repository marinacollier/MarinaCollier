/**
 * "Experimente" chips under the search box, from her own data (never a fixed list of names):
 * a project, the next trip and a place in it, a favourite modality, the book she's reading, the pet.
 */
import { readingNow, upcomingTrips } from '@/data/selectors'
import type { DateKey, DB } from '@/data/types'

export function searchSuggestions(db: DB, today: DateKey, max = 6): string[] {
  const out: string[] = []
  const add = (s?: string) => {
    // Short, searchable words: "Cape Town (base) · Johannesburg" → "Cape Town".
    const v = s?.split(/[,(·/]/)[0]?.trim()
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v)
  }
  const projects = db.projects.filter((p) => p.status === 'ativo').sort((a, b) => a.order - b.order)
  add(projects[0]?.name)
  const trip = upcomingTrips(db, today)[0]
  if (trip) {
    add(trip.place ?? trip.name)
    add(db.tripItems.find((i) => i.tripId === trip.id && i.group)?.group)
  }
  add(db.profile.modalities.find((m) => m.favorite && m.active)?.label.toLowerCase())
  const book = readingNow(db)[0]
  if (book) add(book.title.split(/[:—-]/)[0])
  add(db.pets[0]?.name)
  add(projects[1]?.name)
  return out.slice(0, max)
}
