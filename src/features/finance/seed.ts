import type { FeatureSeed } from '@/data/seed/context'
import { seedId } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'

/**
 * Finance seed. Categories come from the platform defaults (src/data/defaults.ts).
 * By rule we never invent purchases, balances or values. The only values here are the two recurring
 * PJ contracts Marina informed herself (gross billing, 09/10/2026) — editable, never net, no taxes assumed.
 * Their monthly receivables are created as "previsto" by the app; nothing is ever marked received for her.
 */
export const FINANCE_SEED_IDS = {
  contractSantander: seedId('finance', 'contrato-santander'),
  contractFashionFinder: seedId('finance', 'contrato-fashionfinder'),
}

export const seedFinance: FeatureSeed = (ctx) => ({
  contracts: [
    ctx.make('contracts', {
      id: FINANCE_SEED_IDS.contractSantander,
      client: 'Santander',
      aliases: ['santander'],
      projectId: SEED_IDS.projSantander,
      amountCents: 20_000_00,
      currency: 'BRL',
      paymentDay: 15,
      recurrence: 'mensal',
      status: 'ativo',
      kind: 'pj',
      notes: 'Consultoria PJ · faturamento bruto · ativo conforme informado por Marina.',
    }),
    ctx.make('contracts', {
      id: FINANCE_SEED_IDS.contractFashionFinder,
      client: 'Fashion Finder',
      aliases: ['fashion finder', 'fashionfinder', 'ff'],
      projectId: SEED_IDS.projFashionFinder,
      amountCents: 10_000_00,
      currency: 'BRL',
      paymentDay: 30,
      recurrence: 'mensal',
      status: 'ativo',
      kind: 'pj',
      notes: 'Remuneração PJ · faturamento bruto · ativo conforme informado por Marina. Participação societária, se houver, não está formalizada aqui.',
    }),
  ],
})
