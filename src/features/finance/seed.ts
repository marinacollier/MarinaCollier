import type { FeatureSeed } from '@/data/seed/context'

/**
 * Finance seed. Categories come from the platform defaults (src/data/defaults.ts).
 * By rule we never invent purchases, balances or values — Marina's money starts empty.
 */
export const seedFinance: FeatureSeed = () => ({})
