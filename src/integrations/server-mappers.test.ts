/**
 * Tests for the pure modules shared by the Supabase Edge Functions (supabase/functions/_shared).
 * Payloads follow the shapes in the official docs (Google Calendar v3, Microsoft Graph, Organizze v2).
 */
import { describe, expect, it } from 'vitest'
import { classifyMessage } from '../../supabase/functions/_shared/classify.ts'
import {
  mapGoogleEvent,
  mapGraphEvent,
  mapGraphMessage,
  mapOrganizzeAccount,
  mapOrganizzeCard,
  mapOrganizzeTransaction,
  mapTeamsMention,
} from '../../supabase/functions/_shared/mappers.ts'
import type { WireActionCandidate, WireEvent, WireTransaction } from '../../supabase/functions/_shared/types.ts'
import type { RemoteActionCandidate, RemoteEvent, RemoteTransaction } from './types'

// Compile-time: wire types stay assignable to the app contracts.
const _e: RemoteEvent = {} as WireEvent
const _c: RemoteActionCandidate = {} as WireActionCandidate
const _t: RemoteTransaction = {} as WireTransaction
void [_e, _c, _t]

describe('Google events', () => {
  it('timed event with offset → São Paulo', () => {
    expect(
      mapGoogleEvent({
        id: 'evt1',
        iCalUID: 'evt1@google.com',
        status: 'confirmed',
        summary: 'Treino com a Ju',
        htmlLink: 'https://www.google.com/calendar/event?eid=x',
        start: { dateTime: '2026-10-05T07:00:00-03:00', timeZone: 'America/Sao_Paulo' },
        end: { dateTime: '2026-10-05T08:00:00-03:00', timeZone: 'America/Sao_Paulo' },
      }),
    ).toMatchObject({ externalId: 'evt1', globalId: 'evt1@google.com', date: '2026-10-05', startTime: '07:00', endTime: '08:00', allDay: false })
  })

  it('all-day uses exclusive end date', () => {
    expect(mapGoogleEvent({ id: 'a', start: { date: '2026-11-14' }, end: { date: '2026-11-18' }, summary: 'Recife' })).toMatchObject({
      date: '2026-11-14',
      endDate: '2026-11-17',
      allDay: true,
    })
  })

  it('cancelled → deleted, drops everything else', () => {
    expect(mapGoogleEvent({ id: 'c', status: 'cancelled' })).toMatchObject({ externalId: 'c', deleted: true })
  })
})

describe('Graph events', () => {
  it('UTC dateTime (7 fractional digits) → São Paulo', () => {
    expect(
      mapGraphEvent({
        id: 'AAMk1',
        iCalUId: '040000008200E00074C5B7101A82E008',
        subject: 'Weekly',
        isAllDay: false,
        start: { dateTime: '2026-10-08T13:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2026-10-08T14:30:00.0000000', timeZone: 'UTC' },
        location: { displayName: 'Microsoft Teams Meeting' },
      }),
    ).toMatchObject({ date: '2026-10-08', startTime: '10:00', endTime: '11:30', globalId: '040000008200E00074C5B7101A82E008' })
  })

  it('all-day + @removed', () => {
    expect(
      mapGraphEvent({ id: 'x', isAllDay: true, subject: 'Folga', start: { dateTime: '2026-10-12T00:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2026-10-13T00:00:00.0000000', timeZone: 'UTC' } }),
    ).toMatchObject({ date: '2026-10-12', allDay: true, endDate: undefined })
    expect(mapGraphEvent({ id: 'y', '@removed': { reason: 'deleted' } })).toMatchObject({ deleted: true })
  })
})

describe('Outlook messages → candidates (metadata only)', () => {
  it('classifies actionable subjects and ignores the rest', () => {
    const c = mapGraphMessage({ id: 'm1', subject: 'RE: Aprovação do budget Q4', from: { emailAddress: { name: 'Ana', address: 'ana@x.com' } }, receivedDateTime: '2026-10-01T12:00:00Z', webLink: 'https://outlook.office365.com/owa/?ItemID=1' })
    expect(c).toEqual({ externalId: 'm1', source: 'outlook', subject: 'RE: Aprovação do budget Q4', sender: 'Ana', receivedAt: '2026-10-01T12:00:00Z', webUrl: 'https://outlook.office365.com/owa/?ItemID=1', suggestedKind: 'aprovacao' })
    expect(mapGraphMessage({ id: 'm2', subject: 'Newsletter semanal', receivedDateTime: '2026-10-01T12:00:00Z' })).toBeNull()
    expect(mapGraphMessage({ id: 'm3', subject: 'Newsletter', flag: { flagStatus: 'flagged' }, receivedDateTime: '2026-10-01T12:00:00Z' })?.suggestedKind).toBe('action_item')
  })

  it('never carries body-like fields even if Graph sent them', () => {
    const c = mapGraphMessage({ id: 'm', subject: 'Prazo do relatório', receivedDateTime: 'x', ...({ body: { content: 'secreto' }, bodyPreview: 'secreto' } as object) })
    expect(JSON.stringify(c)).not.toContain('secreto')
  })

  it('classifier', () => {
    expect(classifyMessage({ subject: 'Prazo: entrega até sexta' })).toBe('deadline')
    expect(classifyMessage({ subject: 'Você poderia revisar o deck?' })).toBe('pedido')
    expect(classifyMessage({ subject: 'Precisamos decidir o escopo' })).toBe('decisao')
    expect(classifyMessage({ subject: 'Contrato assinado' })).toBe('documento')
    expect(classifyMessage({ subject: 'Convite: Reunião de kickoff' })).toBe('compromisso')
    expect(classifyMessage({ subject: 'Oi' })).toBeUndefined()
    expect(classifyMessage({ subject: 'Oi', importance: 'high' })).toBe('action_item')
  })
})

describe('Teams mentions', () => {
  const chat = { id: '19:abc@thread.v2', topic: 'Squad Pix', chatType: 'group' as const }
  it('only messages mentioning me, without text', () => {
    const msg = {
      id: '1616',
      createdDateTime: '2026-10-01T15:00:00Z',
      messageType: 'message',
      from: { user: { id: 'u2', displayName: 'Carlos' } },
      mentions: [{ mentioned: { user: { id: 'me' } } }],
      ...({ body: { content: '<at>Marina</at> consegue ver isso hoje?' } } as object),
    }
    const c = mapTeamsMention(chat, msg, 'me')
    expect(c).toMatchObject({ externalId: '19:abc@thread.v2/1616', subject: 'Menção em Squad Pix', sender: 'Carlos', suggestedKind: 'mencao' })
    expect(JSON.stringify(c)).not.toContain('consegue')
    expect(mapTeamsMention(chat, { ...msg, mentions: [{ mentioned: { user: { id: 'other' } } }] }, 'me')).toBeNull()
    expect(mapTeamsMention(chat, { ...msg, messageType: 'systemEventMessage' }, 'me')).toBeNull()
  })
})

describe('Organizze', () => {
  it('maps the documented transaction payload', () => {
    expect(
      mapOrganizzeTransaction({
        id: 15,
        description: 'SAQUE LOT',
        date: '2015-09-06',
        paid: false,
        amount_cents: -15000,
        account_id: 3,
        account_type: 'CreditCard',
        category_id: 21,
        updated_at: '2015-08-04T20:17:17-03:00',
      }),
    ).toEqual({
      externalId: '15',
      description: 'SAQUE LOT',
      amountCents: -15000,
      date: '2015-09-06',
      paid: false,
      categoryExternalId: '21',
      accountExternalId: 'cc-3',
      updatedAt: '2015-08-04T20:17:17-03:00',
    })
  })

  it('accounts and cards get distinct ids', () => {
    expect(mapOrganizzeAccount({ id: 3, name: 'Bradesco CC', type: 'checking' })).toEqual({ externalId: 'acc-3', name: 'Bradesco CC', kind: 'conta' })
    expect(mapOrganizzeCard({ id: 3, name: 'Visa Exclusive', closing_day: 4, due_day: 17 })).toEqual({ externalId: 'cc-3', name: 'Visa Exclusive', kind: 'cartao', closingDay: 4, dueDay: 17 })
  })
})
