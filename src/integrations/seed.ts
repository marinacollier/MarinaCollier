import type { FeatureSeed } from '@/data/seed/context'
import type { IntegrationConnection, IntegrationStatus } from '@/data/types'
import { PROVIDER_ORDER, PROVIDERS } from './registry'

/**
 * Owner: Integrations agent. One `integrations` row per provider with an honest initial status.
 * Nothing is connected on first run: no tokens, no scopes granted.
 */
export function initialStatus(provider: (typeof PROVIDER_ORDER)[number]): IntegrationStatus {
  if (provider === 'ics') return 'connected' // local, works offline
  return PROVIDERS[provider].maturity === 'planned' ? 'coming_soon' : 'needs_config'
}

export const seedIntegrations: FeatureSeed = (ctx) => ({
  integrations: PROVIDER_ORDER.map(
    (provider): IntegrationConnection =>
      ctx.make('integrations', {
        id: `int-${provider}`,
        provider,
        status: initialStatus(provider),
        scopes: [],
      }),
  ),
})
