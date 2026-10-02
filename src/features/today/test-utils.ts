/** Tiny builders for pure-function tests in this folder. */
import { emptyDB } from '@/data/defaults'
import type { CollectionKey, DB, ItemOf, NewItem } from '@/data/types'

let n = 0
export function make<K extends CollectionKey>(_key: K, data: NewItem<K>): ItemOf<K> {
  n += 1
  return { createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z', ...data, id: data.id ?? `id-${n}` } as unknown as ItemOf<K>
}

export function db(patch: Partial<DB> = {}): DB {
  return { ...emptyDB(), ...patch }
}

export const hm = (h: number, m = 0) => h * 60 + m
