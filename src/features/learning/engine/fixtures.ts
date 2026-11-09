/** Test fixtures for Aprendizagem (not shipped in the app bundle: only tests import it). */
import { emptyDB } from '@/data/defaults'
import type { DB, LearningError, StudySession } from '@/data/types'
import { TRACK_EN, TRACK_ES } from './model'
import { newCardFields } from './srs'

const AT = '2026-11-09T10:00:00.000Z'

export function sess(id: string, p: Partial<StudySession>): StudySession {
  return { id, createdAt: AT, updatedAt: AT, date: '2026-11-09', minutes: 30, domain: 'idiomas', source: 'app', ...p }
}

export function card(id: string, p: Partial<LearningError> = {}): LearningError {
  return { id, createdAt: AT, updatedAt: AT, front: id, back: `${id}!`, ...newCardFields('2026-11-01'), ...p }
}

export function baseDB(p: Partial<DB> = {}): DB {
  const db = emptyDB()
  return {
    ...db,
    studyTracks: [
      { id: TRACK_EN, createdAt: AT, updatedAt: AT, name: 'Inglês', emoji: '🇬🇧', tone: 'sage', order: 0, archived: false, status: 'ativo' },
      { id: TRACK_ES, createdAt: AT, updatedAt: AT, name: 'Espanhol', emoji: '🇪🇸', tone: 'sand', order: 1, archived: false, status: 'ativo' },
    ],
    ...p,
  } as DB
}

