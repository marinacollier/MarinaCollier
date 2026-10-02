/**
 * Ephemeral UI state: which bottom sheet is open and the toast queue.
 * Open sheets from anywhere with `openSheet('expense', { defaults: {...} })`.
 */
import { create } from 'zustand'
import type { SheetName, SheetProps } from './sheet-types'
import { uid } from '@/lib/id'

interface OpenSheet {
  key: string
  name: SheetName
  props: unknown
}

export interface Toast {
  id: string
  message: string
  /** Shown as a button; typically "Desfazer". */
  action?: { label: string; run: () => void }
  tone?: 'default' | 'win'
}

interface UIState {
  /** A stack so a sheet can open another (quick add → expense) and go back. */
  sheets: OpenSheet[]
  toasts: Toast[]
}

export const useUI = create<UIState>(() => ({ sheets: [], toasts: [] }))

export function openSheet<N extends SheetName>(name: N, props?: SheetProps<N>): void {
  useUI.setState((s) => ({ sheets: [...s.sheets, { key: uid(), name, props: props ?? {} }] }))
}

/** Replace the top sheet (e.g. quick add menu → chosen form). */
export function replaceSheet<N extends SheetName>(name: N, props?: SheetProps<N>): void {
  useUI.setState((s) => ({ sheets: [...s.sheets.slice(0, -1), { key: uid(), name, props: props ?? {} }] }))
}

export function closeSheet(): void {
  useUI.setState((s) => ({ sheets: s.sheets.slice(0, -1) }))
}

export function closeAllSheets(): void {
  useUI.setState({ sheets: [] })
}

export function toast(message: string, opts: Omit<Toast, 'id' | 'message'> = {}): void {
  const t: Toast = { id: uid(), message, ...opts }
  useUI.setState((s) => ({ toasts: [...s.toasts.slice(-2), t] }))
  setTimeout(() => dismissToast(t.id), opts.action ? 5000 : 2600)
}

export function dismissToast(id: string): void {
  useUI.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}
