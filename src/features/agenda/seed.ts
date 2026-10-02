import { seedId, type FeatureSeed } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import { startOfWeek } from '@/lib/date'

export const SEED_CERAMICA_ID = seedId('agenda', 'ceramica')
export const SEED_FISIO_ID = seedId('agenda', 'fisioterapia')

/**
 * Agenda seed: the local calendar + the personal commitments Marina told us about.
 * - Cerâmica: segunda e quinta à noite, BASE. She didn't give an exact time → period only.
 * - Fisioterapia: sexta 12:00–13:00, BASE (saúde, not a workout).
 * Not seeded here on purpose: the English class (comes from the connected calendar) and the
 * CEO Review / Monthly Board (seeded by the Work area).
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
  events: [
    ctx.make('events', {
      id: SEED_CERAMICA_ID,
      sourceId: SEED_IDS.sourceLocal,
      title: 'Cerâmica',
      date: startOfWeek(ctx.today),
      allDay: false,
      period: 'noite',
      kind: 'criatividade',
      category: 'Vida / Criatividade',
      planType: 'base',
      recurrence: { kind: 'weekly', weekdays: [1, 4] },
    }),
    // A care commitment of its own — not a training.
    ctx.make('events', {
      id: SEED_FISIO_ID,
      sourceId: SEED_IDS.sourceLocal,
      title: 'Fisioterapia',
      date: startOfWeek(ctx.today),
      allDay: false,
      startTime: '12:00',
      endTime: '13:00',
      kind: 'saude',
      planType: 'base',
      recurrence: { kind: 'weekly', weekdays: [5] },
    }),
  ],
})
