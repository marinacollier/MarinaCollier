/**
 * The 'priorities' sheet only receives { date }. To open it on a domain tab (Trabalho · Corpo · Vida)
 * the caller leaves the wanted tab here right before openSheet; it's valid for a moment only,
 * so plain openSheet('priorities') calls always land on the main Top 3.
 */
import { openSheet } from '@/app/ui-store'
import type { DateKey } from '@/data/types'
import type { PriorityList } from './priorities'

let pending: { list: PriorityList; at: number } | undefined

export function takeInitialList(): PriorityList {
  return pending && Date.now() - pending.at < 1500 ? pending.list : 'main'
}

export function openPriorities(date: DateKey, list: PriorityList = 'main'): void {
  pending = { list, at: Date.now() }
  openSheet('priorities', { date })
}
