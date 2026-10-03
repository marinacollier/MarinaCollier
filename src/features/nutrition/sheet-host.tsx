/**
 * Local sheet stack for the nutrition screens (meal detail, Meus alimentos). The global sheet
 * registry is shared; until these are registered there (see "Contract requests"), they live here.
 * Several screens mount a host; only the first mounted one renders, so sheets never double up.
 */
import { Suspense, lazy, useEffect, useId, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'framer-motion'
import { create } from 'zustand'
import { SheetFrame } from '@/components/ui/Sheet'
import { uid } from '@/lib/id'
import type { DateKey, FoodItem, ID } from '@/data/types'

export interface NutritionSheetProps {
  mealDetail: { date: DateKey; ref: string }
  myFood: { id?: ID; defaults?: Partial<FoodItem> }
}
type Name = keyof NutritionSheetProps

interface State {
  sheets: { key: string; name: Name; props: unknown }[]
  hosts: string[]
}

const useNutriUI = create<State>(() => ({ sheets: [], hosts: [] }))

export function openNutritionSheet<N extends Name>(name: N, props: NutritionSheetProps[N]): void {
  useNutriUI.setState((s) => ({ sheets: [...s.sheets, { key: uid(), name, props }] }))
}

export function closeNutritionSheet(): void {
  useNutriUI.setState((s) => ({ sheets: s.sheets.slice(0, -1) }))
}

export function closeAllNutritionSheets(): void {
  useNutriUI.setState({ sheets: [] })
}

/** True when a host is mounted (so a sheet can be opened from anywhere). */
export function hasNutritionHost(): boolean {
  return useNutriUI.getState().hosts.length > 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SHEETS: Record<Name, ComponentType<any>> = {
  mealDetail: lazy(() => import('./MealDetailSheet')),
  myFood: lazy(() => import('./MyFoodSheet')),
}

export function NutritionSheetHost() {
  const id = useId()
  const sheets = useNutriUI((s) => s.sheets)
  const owner = useNutriUI((s) => s.hosts[0] === id)
  useEffect(() => {
    useNutriUI.setState((s) => ({ hosts: [...s.hosts, id] }))
    return () => {
      useNutriUI.setState((s) => ({ hosts: s.hosts.filter((h) => h !== id), sheets: s.hosts.length <= 1 ? [] : s.sheets }))
    }
  }, [id])
  if (!owner || typeof document === 'undefined') return null
  return createPortal(
    <div className="relative z-[60]">
      <AnimatePresence>
        {sheets.map((s, i) => {
          const Comp = SHEETS[s.name]
          return (
            <SheetFrame key={s.key} onClose={closeNutritionSheet} depth={10 + i} isTop={i === sheets.length - 1}>
              <Suspense fallback={<div className="h-48" />}>
                <Comp {...(s.props as object)} />
              </Suspense>
            </SheetFrame>
          )
        })}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
