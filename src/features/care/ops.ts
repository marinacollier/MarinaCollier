/**
 * Cuidar de Mim — os únicos escritores das coleções privadas do módulo.
 * - Preferências por técnica: id determinístico (`care-pref-<técnica>`), uma por técnica.
 * - "Registrar que usei" só existe quando ela toca. Nada é registrado sozinho; não há pontuação.
 * - Rascunho de pausa: gravado no aparelho e só então confirmado (persist()).
 * - Plano de apoio: um só registro (`care-support-plan`).
 */
import { actions, getDB, persist } from '@/data/store'
import type { CarePauseDraft, CarePreference, CareSupportPlan, CareTechniquePref, ID, NewItem } from '@/data/types'
import { nowISO } from '@/lib/id'

export const prefId = (techniqueId: string): ID => `care-pref-${techniqueId}`
export const SUPPORT_PLAN_ID: ID = 'care-support-plan'

export function prefOf(techniqueId: string, db = getDB()): CareTechniquePref | undefined {
  return (db.careTechniquePrefs ?? []).find((p) => p.id === prefId(techniqueId))
}

function upsertPref(techniqueId: string, patch: Partial<CareTechniquePref>): void {
  const current = prefOf(techniqueId)
  if (current) actions.update('careTechniquePrefs', current.id, patch)
  else actions.create('careTechniquePrefs', { id: prefId(techniqueId), techniqueId, favorite: false, usedAt: [], ...patch })
}

export function toggleFavorite(techniqueId: string): boolean {
  const next = !prefOf(techniqueId)?.favorite
  upsertPref(techniqueId, { favorite: next })
  return next
}

/** Same value again clears it (tap to unselect). */
export function setPreference(techniqueId: string, preference: CarePreference | undefined): void {
  const same = prefOf(techniqueId)?.preference === preference
  upsertPref(techniqueId, { preference: same ? undefined : preference })
}

export function registerUse(techniqueId: string, at: string = nowISO()): () => void {
  const before = prefOf(techniqueId)?.usedAt ?? []
  upsertPref(techniqueId, { usedAt: [...before, at] })
  return () => upsertPref(techniqueId, { usedAt: before })
}

export function favoriteIds(db = getDB()): string[] {
  return (db.careTechniquePrefs ?? []).filter((p) => p.favorite).map((p) => p.techniqueId)
}

/** Grava e confirma no aparelho. Só retorna ok depois da gravação lida de volta. */
export async function savePauseDraft(data: Omit<NewItem<'carePauseDrafts'>, 'id'>): Promise<{ ok: boolean; draft?: CarePauseDraft }> {
  if (!data.text.trim()) return { ok: false }
  const draft = actions.create('carePauseDrafts', data)
  const r = await persist()
  return r.ok ? { ok: true, draft } : { ok: false, draft }
}

export function removePauseDraft(id: ID): CarePauseDraft | undefined {
  return actions.remove('carePauseDrafts', id)
}

export function supportPlan(db = getDB()): CareSupportPlan | undefined {
  return (db.careSupportPlan ?? []).find((p) => p.id === SUPPORT_PLAN_ID)
}

export function saveSupportPlan(patch: Partial<Omit<CareSupportPlan, 'id' | 'createdAt' | 'updatedAt'>>): void {
  const current = supportPlan()
  if (current) actions.update('careSupportPlan', current.id, patch)
  else actions.create('careSupportPlan', { id: SUPPORT_PLAN_ID, contacts: [], ...patch })
}
