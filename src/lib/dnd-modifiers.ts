import type { Modifier } from '@dnd-kit/core'

/** Inline version of @dnd-kit/modifiers' restrictToVerticalAxis (avoids an extra dependency). */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })
