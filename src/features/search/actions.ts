/**
 * What happens when Marina taps a search result, a command or an item in a Mari answer.
 * Results only *describe* the action (pure data, easy to test); `runAction` performs it.
 */
import { closeSheet, openSheet, replaceSheet } from '@/app/ui-store'
import type { SheetName, SheetProps } from '@/app/sheet-types'

export type SheetCall = { [N in SheetName]: { name: N; props?: SheetProps<N> } }[SheetName]

export type ResultAction = { kind: 'route'; to: string } | ({ kind: 'sheet' } & SheetCall)

export function routeAction(to: string): ResultAction {
  return { kind: 'route', to }
}

export function sheetAction<N extends SheetName>(name: N, props?: SheetProps<N>): ResultAction {
  return { kind: 'sheet', name, props } as ResultAction
}

/**
 * Perform an action.
 * - from 'page': routes navigate, sheets open on top.
 * - from 'sheet' (command palette): sheets replace the palette, routes close it first.
 */
export function runAction(action: ResultAction, navigate: (to: string) => void, from: 'page' | 'sheet' = 'page'): void {
  if (action.kind === 'route') {
    if (from === 'sheet') closeSheet()
    navigate(action.to)
    return
  }
  const name = action.name as SheetName
  const props = action.props as never
  if (from === 'sheet') replaceSheet(name, props)
  else openSheet(name, props)
}
