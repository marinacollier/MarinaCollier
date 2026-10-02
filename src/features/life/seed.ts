import type { FeatureSeed } from '@/data/seed/context'
import { seedId } from '@/data/seed/context'
import type { NewItem, PetTaskCategory } from '@/data/types'
import { SEED_IDS } from '@/data/seed/ids'

/**
 * Luna, as Marina described her: a Border Collie with three flexible daily routines and a few
 * life-admin areas (empty slots she fills when she wants). No medical dates, intervals, money or
 * needs she didn't give. Vida real starts empty on purpose — categories + quick add, no invented chores.
 */
export const seedLife: FeatureSeed = (ctx) => {
  const pet = ctx.make('pets', {
    id: SEED_IDS.petLuna,
    name: 'Luna',
    species: 'cachorro',
    breed: 'Border Collie',
    documents: [],
  })

  const petTask = (slug: string, order: number, title: string, category: PetTaskCategory, extra: Partial<NewItem<'petTasks'>> = {}) =>
    ctx.make('petTasks', { id: seedId('luna', slug), petId: pet.id, title, category, active: true, order, ...extra })

  const petTasks = [
    // Flexible routines (BASE): gentle daily checks, skipped when she's at creche/hotel.
    petTask('passeio-manha', 0, 'Passeio manhã', 'passeio', { recurrence: { kind: 'daily' } }),
    petTask('passeio-fim-do-dia', 1, 'Passeio fim do dia', 'passeio', { recurrence: { kind: 'daily' } }),
    petTask('alimentacao', 2, 'Alimentação', 'alimentacao', { recurrence: { kind: 'daily' } }),
    // Life-admin areas: no date, no recurrence — editable slots.
    petTask('racao', 10, 'Ração', 'alimentacao'),
    petTask('creche-hotel', 11, 'Creche/hotel', 'creche'),
    petTask('banho', 12, 'Banho', 'banho'),
    petTask('veterinario', 13, 'Veterinário', 'veterinario'),
    petTask('compras', 14, 'Compras', 'compras'),
    petTask('documentos', 15, 'Documentos', 'documento'),
  ]

  return { pets: [pet], petTasks }
}
