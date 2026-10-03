/**
 * First-run data. Each feature owns its own seed file; this module only composes them.
 * Rule: no invented appointments or money values. Uncertain items use 'review' / 'a_confirmar'.
 */
import type { CollectionKey, DateKey, DB } from '../types'
import { defaultCategories, emptyDB } from '../defaults'
import { createSeedContext, type FeatureSeed } from './context'
import { seedToday } from '@/features/today/seed'
import { seedInbox } from '@/features/inbox/seed'
import { seedBody } from '@/features/body/seed'
import { seedFinance } from '@/features/finance/seed'
import { seedWork } from '@/features/work/seed'
import { seedLearning } from '@/features/learning/seed'
import { seedTravel } from '@/features/travel/seed'
import { seedCreator } from '@/features/creator/seed'
import { seedLife } from '@/features/life/seed'
import { seedAgenda } from '@/features/agenda/seed'
import { seedGoals } from '@/features/goals/seed'
import { seedIntegrations } from '@/integrations/seed'
import { seedProfile } from './profile'
import { seedNutrition } from '@/features/nutrition/seed'

const FEATURE_SEEDS: FeatureSeed[] = [
  seedProfile,
  seedToday,
  seedInbox,
  seedBody,
  seedFinance,
  seedWork,
  seedLearning,
  seedTravel,
  seedCreator,
  seedLife,
  seedAgenda,
  seedGoals,
  seedIntegrations,
  seedNutrition,
]

export function buildSeed(today: DateKey): DB {
  const ctx = createSeedContext(today)
  const db = emptyDB()
  db.financialCategories = defaultCategories(ctx.now)
  for (const seed of FEATURE_SEEDS) {
    const { profile, ...part } = seed(ctx)
    if (profile) db.profile = { ...db.profile, ...profile }
    for (const [key, items] of Object.entries(part) as [CollectionKey, unknown[]][]) {
      ;(db[key] as unknown[]) = [...(db[key] as unknown[]), ...items]
    }
  }
  db.profile.seedVersion = LIFE_SEED_VERSION
  return db
}

/** Bump when the life seed gains records that existing installs should receive (see migrate.ts). */
export const LIFE_SEED_VERSION = 4
