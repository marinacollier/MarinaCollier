/**
 * How Home talks to Lumos. When the assistant exposes its sheet (features/assistant/LumosSheet.tsx,
 * default export `LumosSheet({ request })`), Home's answers slide up in a bottom sheet over the page;
 * otherwise the sentence goes to the Lumos page (?q=), which understands it.
 * The glob keeps this file valid whether or not that component exists yet.
 */
import { lazy, type ComponentType } from 'react'
import { ROUTES } from '@/app/routes'

/** A new `n` = a new request: a sentence, or a print/PDF with what she typed. */
export interface LumosRequest {
  n: number
  text?: string
  file?: File
  caption?: string
}

type SheetModule = { default: ComponentType<{ request?: LumosRequest }> }

const found = import.meta.glob<SheetModule>('/src/features/assistant/LumosSheet.tsx')
const loader = Object.values(found)[0]

/** Lazy Lumos sheet, or undefined when the assistant doesn't provide one. */
export const LumosSheet = loader ? lazy(loader) : undefined

export const lumosHref = (q?: string) => (q?.trim() ? `${ROUTES.assistant}?q=${encodeURIComponent(q.trim())}` : ROUTES.assistant)
