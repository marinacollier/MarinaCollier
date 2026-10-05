/**
 * How Home talks to Lumos. When the assistant exposes its inline conversation
 * (features/assistant/LumosInline.tsx, default export `LumosInline({ initial })`), Home renders the
 * answer right there; otherwise the sentence goes to the Lumos page (?q=), which understands it.
 * The glob keeps this file valid whether or not that component exists yet.
 */
import { lazy, type ComponentType } from 'react'
import { ROUTES } from '@/app/routes'

type InlineModule = { default: ComponentType<{ initial?: string }> }

const found = import.meta.glob<InlineModule>('/src/features/assistant/LumosInline.tsx')
const loader = Object.values(found)[0]

/** Lazy inline conversation, or undefined when the assistant doesn't provide one. */
export const LumosInline = loader ? lazy(loader) : undefined

export const lumosHref = (q?: string) => (q?.trim() ? `${ROUTES.assistant}?q=${encodeURIComponent(q.trim())}` : ROUTES.assistant)
