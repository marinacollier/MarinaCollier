/**
 * ICS subscription by URL. Calendar hosts rarely send CORS headers, so the file is fetched by the
 * `ics-proxy` Edge Function and parsed here. Needs the backend (VITE_MARINA_API_URL).
 */
import { actions, getDB } from '@/data/store'
import { callBackend } from '../backend'
import { applyCalendarEvents } from '../sync'
import type { SyncReport } from '../types'
import { ensureICSSource, parseICS } from './index'

export async function importICSUrl(url: string, sourceName: string): Promise<SyncReport> {
  const text = await callBackend<string>('ics-proxy', { query: { url }, responseType: 'text' })
  const sourceId = ensureICSSource(sourceName)
  const source = getDB().calendarSources.find((s) => s.id === sourceId)
  if (source && source.icsUrl !== url) actions.update('calendarSources', sourceId, { icsUrl: url })
  return applyCalendarEvents(sourceId, parseICS(text), { fullSync: true })
}
