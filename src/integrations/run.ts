/**
 * "Sincronizar agora": pulls from a connected provider (through the backend) and writes via sync.ts.
 * Only callable when the provider status is 'connected' — the UI never offers it otherwise.
 */
import { actions, getDB } from '@/data/store'
import type { IntegrationConnection, IntegrationStatus, ProviderId } from '@/data/types'
import { addDays, addMonths, startOfMonth, todayKey } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { BackendError, fetchConnectionStatuses } from './backend'
import { googleCalendar } from './google'
import { microsoftCalendar } from './microsoft'
import { organizze } from './organizze'
import { outlookMail } from './outlook'
import { applyAccounts, applyActionCandidates, applyCalendarEvents, applyTransactions } from './sync'
import { teamsMentions } from './teams'
import type { CalendarProvider, SyncReport } from './types'
import { EMPTY_REPORT } from './types'

function add(a: SyncReport, b: SyncReport): SyncReport {
  return {
    created: a.created + b.created,
    updated: a.updated + b.updated,
    deleted: a.deleted + b.deleted,
    unchanged: a.unchanged + b.unchanged,
    conflicts: a.conflicts + b.conflicts,
  }
}

function connectionRow(provider: ProviderId): IntegrationConnection | undefined {
  return getDB().integrations.find((c) => c.provider === provider)
}

/** Update (or create) the local status row for a provider. Never stores tokens. */
export function setConnection(provider: ProviderId, patch: Partial<Omit<IntegrationConnection, 'id' | 'provider'>>): void {
  const row = connectionRow(provider)
  if (row) actions.update('integrations', row.id, patch)
  else actions.create('integrations', { provider, status: patch.status ?? 'needs_config', scopes: [], ...patch })
}

async function syncCalendar(provider: 'google' | 'microsoft', adapter: CalendarProvider): Promise<SyncReport> {
  const today = todayKey()
  const range = { from: addDays(today, -7), to: addDays(today, 90) }
  const calendars = await adapter.listCalendars()
  const account = connectionRow(provider)?.accountLabel
  let report = { ...EMPTY_REPORT }
  for (const cal of calendars) {
    let source = getDB().calendarSources.find((s) => s.provider === provider && s.calendarId === cal.externalId)
    if (!source) {
      source = actions.create('calendarSources', {
        provider,
        name: cal.name,
        calendarId: cal.externalId,
        externalAccountId: account,
        syncDirection: 'read',
        color: provider === 'google' ? 'sage' : 'plum',
        enabled: !!cal.primary,
      })
    }
    if (!source.enabled) continue
    const events = await adapter.listEvents(cal.externalId, range)
    report = add(report, applyCalendarEvents(source.id, events, { fullSync: true, range }))
  }
  return report
}

export async function syncProvider(provider: ProviderId): Promise<SyncReport> {
  try {
    let report: SyncReport
    const since = connectionRow(provider)?.lastSyncAt ?? new Date(Date.now() - 7 * 86_400_000).toISOString()
    switch (provider) {
      case 'google':
        report = await syncCalendar('google', googleCalendar)
        break
      case 'microsoft':
        report = await syncCalendar('microsoft', microsoftCalendar)
        break
      case 'outlook':
        report = applyActionCandidates(await outlookMail.listActionCandidates(since))
        break
      case 'teams':
        report = applyActionCandidates(await teamsMentions.listActionCandidates(since))
        break
      case 'organizze': {
        const today = todayKey()
        const range = { from: addMonths(startOfMonth(today), -1), to: today }
        applyAccounts(await organizze.listAccounts())
        const categories = await organizze.listCategories()
        report = applyTransactions(await organizze.listTransactions(range), { categories, range })
        break
      }
      default:
        throw new Error('Essa integração não sincroniza pelo servidor')
    }
    setConnection(provider, { status: 'connected', lastSyncAt: nowISO(), error: undefined })
    return report
  } catch (err) {
    if (err instanceof BackendError && err.code === 'policy_blocked') setConnection(provider, { status: 'policy_blocked' })
    else if (err instanceof BackendError && err.code === 'needs_auth') setConnection(provider, { status: 'needs_auth' })
    else setConnection(provider, { status: 'error', error: err instanceof Error ? err.message : 'Erro desconhecido' })
    throw err
  }
}

/** Pull connection rows from the backend into local `integrations` (no tokens involved). */
export async function refreshConnections(): Promise<void> {
  const remote = await fetchConnectionStatuses()
  for (const r of remote) {
    setConnection(r.provider, {
      status: r.status as IntegrationStatus,
      accountLabel: r.accountLabel,
      scopes: r.scopes ?? [],
      lastSyncAt: r.lastSyncAt,
      error: r.error,
    })
  }
}

/** Read `?integration=<p>&status=<s>` left by the backend OAuth callback. */
export function parseOAuthReturn(search: string): { provider: ProviderId; status: IntegrationStatus } | null {
  const q = new URLSearchParams(search)
  const provider = q.get('integration')
  const status = q.get('status')
  const providers: ProviderId[] = ['google', 'microsoft', 'outlook', 'teams']
  const statuses: IntegrationStatus[] = ['connected', 'policy_blocked', 'error', 'needs_auth']
  if (!provider || !status) return null
  if (!providers.includes(provider as ProviderId) || !statuses.includes(status as IntegrationStatus)) return null
  return { provider: provider as ProviderId, status: status as IntegrationStatus }
}
