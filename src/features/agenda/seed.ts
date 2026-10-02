import type { FeatureSeed } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'

/**
 * Agenda seed: only the local calendar source. No events — we never invent appointments.
 */
export const seedAgenda: FeatureSeed = (ctx) => ({
  calendarSources: [
    ctx.make('calendarSources', {
      id: SEED_IDS.sourceLocal,
      provider: 'local',
      name: 'MARINA OS',
      color: 'var(--accent)',
      syncDirection: 'none',
      enabled: true,
    }),
  ],
})
