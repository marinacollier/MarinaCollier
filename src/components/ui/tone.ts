import type { Tone } from '@/data/types'

/** Static class maps so Tailwind can see every class name. */
export const TONE: Record<Tone, { soft: string; text: string; solid: string; border: string; dot: string }> = {
  accent: { soft: 'bg-accent-soft', text: 'text-accent', solid: 'bg-accent text-white', border: 'border-accent', dot: 'bg-accent' },
  sage: { soft: 'bg-sage-soft', text: 'text-sage', solid: 'bg-sage text-white', border: 'border-sage', dot: 'bg-sage' },
  ocean: { soft: 'bg-ocean-soft', text: 'text-ocean', solid: 'bg-ocean text-white', border: 'border-ocean', dot: 'bg-ocean' },
  sand: { soft: 'bg-sand-soft', text: 'text-sand', solid: 'bg-sand text-white', border: 'border-sand', dot: 'bg-sand' },
  plum: { soft: 'bg-plum-soft', text: 'text-plum', solid: 'bg-plum text-white', border: 'border-plum', dot: 'bg-plum' },
  ink: { soft: 'bg-surface-2', text: 'text-ink', solid: 'bg-ink text-bg', border: 'border-ink', dot: 'bg-ink' },
}

export const TONES: Tone[] = ['accent', 'sage', 'ocean', 'sand', 'plum', 'ink']

export function tone(t: string | undefined) {
  return TONE[(t as Tone) in TONE ? (t as Tone) : 'ink']
}
