/**
 * Nutrition sheets (meal detail, Meus alimentos) are registered in the global sheet registry
 * (app/sheets.tsx). These helpers keep the names the nutrition screens already use.
 */
import { closeAllSheets, closeSheet, openSheet } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'

export interface NutritionSheetProps {
  mealDetail: SheetProps<'mealDetail'>
  myFood: SheetProps<'myFood'>
}

export function openNutritionSheet<N extends keyof NutritionSheetProps>(name: N, props: NutritionSheetProps[N]): void {
  openSheet(name, props as never)
}

export const closeNutritionSheet = closeSheet
export const closeAllNutritionSheets = closeAllSheets

/** Sheets are global now, so one can always be opened. */
export function hasNutritionHost(): boolean {
  return true
}

/** Kept for existing call sites; the global SheetHost renders the sheets. */
export function NutritionSheetHost() {
  return null
}
