import { beforeEach, describe, expect, it } from 'vitest'
import { useStore, getDB } from '@/data/store'
import { emptyDB } from '@/data/defaults'
import type { CalendarEvent } from '@/data/types'
import { escapeText, foldLine, importICSText, parseDuration, parseICS, toICS, unescapeText } from './index'

const CRLF = (s: string) => s.trim().split('\n').map((l) => l.replace(/^\s{4}/, '')).join('\r\n') + '\r\n'

// Shaped like a Google Calendar export ("Exportar" → .ics).
const GOOGLE = CRLF(`
    BEGIN:VCALENDAR
    PRODID:-//Google Inc//Google Calendar 70.9054//EN
    VERSION:2.0
    CALSCALE:GREGORIAN
    METHOD:PUBLISH
    X-WR-CALNAME:Marina
    X-WR-TIMEZONE:America/Sao_Paulo
    BEGIN:VEVENT
    DTSTART:20261005T130000Z
    DTEND:20261005T140000Z
    DTSTAMP:20261001T120000Z
    UID:abc123@google.com
    CREATED:20260920T100000Z
    DESCRIPTION:Pauta: roadmap\\, métricas\\nLink no convite
    LAST-MODIFIED:20260921T100000Z
    LOCATION:Av. Paulista\\, 1000 - São Paulo
    SEQUENCE:0
    STATUS:CONFIRMED
    SUMMARY:Reunião de produto
    TRANSP:OPAQUE
    BEGIN:VALARM
    ACTION:DISPLAY
    DESCRIPTION:This is an event reminder
    TRIGGER:-P0DT0H10M0S
    END:VALARM
    END:VEVENT
    BEGIN:VEVENT
    DTSTART;VALUE=DATE:20261012
    DTEND;VALUE=DATE:20261013
    UID:feriado@google.com
    SUMMARY:Nossa Senhora Aparecida
    END:VEVENT
    BEGIN:VEVENT
    DTSTART;VALUE=DATE:20261020
    DTEND;VALUE=DATE:20261024
    UID:viagem@google.com
    SUMMARY:Itacaré
    END:VEVENT
    BEGIN:VEVENT
    DTSTART;TZID=America/Sao_Paulo:20261006T070000
    DTEND;TZID=America/Sao_Paulo:20261006T080000
    RRULE:FREQ=WEEKLY;BYDAY=TU,TH
    UID:corrida@google.com
    SUMMARY:Corrida
    END:VEVENT
    BEGIN:VEVENT
    DTSTART:20261007T120000Z
    DTEND:20261007T130000Z
    UID:cancelada@google.com
    STATUS:CANCELLED
    SUMMARY:Almoço cancelado
    END:VEVENT
    END:VCALENDAR
`)

// Shaped like an Outlook / Exchange export: Windows TZID names + VTIMEZONE block + folded lines.
const OUTLOOK = CRLF(`
    BEGIN:VCALENDAR
    PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
    VERSION:2.0
    METHOD:PUBLISH
    BEGIN:VTIMEZONE
    TZID:E. South America Standard Time
    BEGIN:STANDARD
    DTSTART:16010101T000000
    TZOFFSETFROM:-0300
    TZOFFSETTO:-0300
    END:STANDARD
    END:VTIMEZONE
    BEGIN:VEVENT
    CLASS:PUBLIC
    DTEND;TZID="E. South America Standard Time":20261008T113000
    DTSTART;TZID="E. South America Standard Time":20261008T100000
    DTSTAMP:20261001T150000Z
    LOCATION:Microsoft Teams Meeting
    SUMMARY;LANGUAGE=pt-BR:Weekly Santander - alinhamento de squads e prioridades d
     o trimestre
    UID:040000008200E00074C5B7101A82E00800000000ABCDEF
    X-MICROSOFT-CDO-BUSYSTATUS:BUSY
    END:VEVENT
    BEGIN:VEVENT
    DTSTART;TZID=Pacific Standard Time:20261009T090000
    DURATION:PT45M
    SUMMARY:Call com time de SF
    UID:sf-call
    END:VEVENT
    BEGIN:VEVENT
    DTSTART;TZID=E. South America Standard Time:20261013T090000
    DTEND;TZID=E. South America Standard Time:20261013T093000
    RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=TU
    EXDATE;TZID=E. South America Standard Time:20261020T090000
    SUMMARY:Daily de squad
    UID:series-1
    END:VEVENT
    BEGIN:VEVENT
    RECURRENCE-ID;TZID=E. South America Standard Time:20261027T090000
    DTSTART;TZID=E. South America Standard Time:20261027T100000
    DTEND;TZID=E. South America Standard Time:20261027T103000
    SUMMARY:Daily de squad (movida)
    UID:series-1
    END:VEVENT
    END:VCALENDAR
`)

describe('parseICS — Google-like export', () => {
  const events = parseICS(GOOGLE)

  it('converts UTC to São Paulo and unescapes text', () => {
    const e = events.find((x) => x.externalId === 'abc123@google.com')!
    expect(e).toMatchObject({ title: 'Reunião de produto', date: '2026-10-05', startTime: '10:00', endTime: '11:00', allDay: false })
    expect(e.location).toBe('Av. Paulista, 1000 - São Paulo')
    expect(e.globalId).toBe('abc123@google.com')
    expect(e.updatedAt).toBe('2026-09-21T10:00:00.000Z')
  })

  it('ignores VALARM properties inside VEVENT', () => {
    const e = events.find((x) => x.externalId === 'abc123@google.com')!
    expect(e.title).not.toMatch(/reminder/)
  })

  it('all-day with exclusive DTEND → single day / inclusive endDate', () => {
    expect(events.find((x) => x.externalId === 'feriado@google.com')).toMatchObject({ date: '2026-10-12', allDay: true, endDate: undefined })
    expect(events.find((x) => x.externalId === 'viagem@google.com')).toMatchObject({ date: '2026-10-20', endDate: '2026-10-23', allDay: true })
  })

  it('open-ended weekly RRULE becomes a Recurrence', () => {
    const e = events.find((x) => x.externalId === 'corrida@google.com')!
    expect(e.recurrence).toEqual({ kind: 'weekly', weekdays: [2, 4] })
    expect(e).toMatchObject({ startTime: '07:00', endTime: '08:00' })
  })

  it('STATUS:CANCELLED → deleted', () => {
    expect(events.find((x) => x.externalId === 'cancelada@google.com')?.deleted).toBe(true)
  })
})

describe('parseICS — Outlook-like export', () => {
  const events = parseICS(OUTLOOK)

  it('handles quoted Windows TZID and folded SUMMARY', () => {
    const e = events.find((x) => x.globalId === '040000008200E00074C5B7101A82E00800000000ABCDEF')!
    expect(e.title).toBe('Weekly Santander - alinhamento de squads e prioridades do trimestre')
    expect(e).toMatchObject({ date: '2026-10-08', startTime: '10:00', endTime: '11:30' })
  })

  it('converts other zones (Pacific, DST in October) and applies DURATION', () => {
    const e = events.find((x) => x.externalId === 'sf-call')!
    // 09:00 PDT (UTC-7) = 13:00 in São Paulo (UTC-3)
    expect(e).toMatchObject({ date: '2026-10-09', startTime: '13:00', endTime: '13:45' })
  })

  it('expands finite series, honours EXDATE and RECURRENCE-ID overrides', () => {
    const series = events.filter((x) => x.globalId === 'series-1').sort((a, b) => a.date.localeCompare(b.date))
    expect(series.map((s) => [s.date, s.startTime, s.title])).toEqual([
      ['2026-10-13', '09:00', 'Daily de squad'],
      ['2026-10-27', '10:00', 'Daily de squad (movida)'],
      ['2026-11-03', '09:00', 'Daily de squad'],
    ])
    expect(new Set(series.map((s) => s.externalId)).size).toBe(3)
  })
})

describe('parseICS — rules and edge cases', () => {
  const wrap = (body: string) => `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:x\n${body}\nEND:VEVENT\nEND:VCALENDAR\n`

  it('monthly by month day and last day', () => {
    expect(parseICS(wrap('DTSTART;VALUE=DATE:20261010\nRRULE:FREQ=MONTHLY;BYMONTHDAY=10\nSUMMARY:Aluguel'))[0].recurrence).toEqual({ kind: 'monthly', dayOfMonth: 10 })
    expect(parseICS(wrap('DTSTART;VALUE=DATE:20261031\nRRULE:FREQ=MONTHLY;BYMONTHDAY=-1\nSUMMARY:Fatura'))[0].recurrence).toEqual({ kind: 'monthly', dayOfMonth: 'last' })
  })

  it('daily with interval → every_n_days anchored at start', () => {
    expect(parseICS(wrap('DTSTART;VALUE=DATE:20261001\nRRULE:FREQ=DAILY;INTERVAL=3\nSUMMARY:Regar'))[0].recurrence).toEqual({ kind: 'every_n_days', days: 3, anchor: '2026-10-01' })
  })

  it('unrepresentable open rule → first occurrence only', () => {
    const ev = parseICS(wrap('DTSTART;VALUE=DATE:20261013\nRRULE:FREQ=MONTHLY;BYDAY=2TU\nSUMMARY:Clube'))
    expect(ev).toHaveLength(1)
    expect(ev[0].recurrence).toBeUndefined()
  })

  it('UNTIL limits a daily series', () => {
    const ev = parseICS(wrap('DTSTART:20261001T110000Z\nDTEND:20261001T120000Z\nRRULE:FREQ=DAILY;UNTIL=20261003T235959Z\nSUMMARY:Imersão'))
    expect(ev.map((e) => e.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })

  it('floating times are São Paulo; events crossing midnight keep end time', () => {
    const ev = parseICS(wrap('DTSTART:20261010T220000\nDTEND:20261011T000000\nSUMMARY:Show'))[0]
    expect(ev).toMatchObject({ date: '2026-10-10', startTime: '22:00', endTime: '23:59', endDate: undefined })
    const multi = parseICS(wrap('DTSTART:20261010T200000\nDTEND:20261012T100000\nSUMMARY:Retiro'))[0]
    expect(multi).toMatchObject({ date: '2026-10-10', startTime: '20:00', endDate: '2026-10-12', endTime: '10:00' })
  })

  it('missing UID gets a stable synthetic id but no globalId', () => {
    const text = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261010\nSUMMARY:Sem uid\nEND:VEVENT\nEND:VCALENDAR'
    const a = parseICS(text)[0]
    expect(a.externalId).toBe(parseICS(text)[0].externalId)
    expect(a.globalId).toBeUndefined()
  })

  it('parseDuration', () => {
    expect(parseDuration('PT1H30M')).toEqual({ days: 0, ms: 90 * 60_000 })
    expect(parseDuration('P2D')).toEqual({ days: 2, ms: 0 })
    expect(parseDuration('P1W')).toEqual({ days: 7, ms: 0 })
    expect(parseDuration('nope')).toBeNull()
  })
})

describe('toICS', () => {
  const base = { createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', sourceId: 'cal-local' }
  const events: CalendarEvent[] = [
    { ...base, id: 'e1', title: 'Yoga; com a Ana, no parque', date: '2026-10-05', startTime: '07:30', endTime: '08:30', allDay: false, location: 'Ibirapuera', notes: 'Levar tapete\nE água' },
    { ...base, id: 'e2', title: 'Recife ✈️', date: '2026-11-14', endDate: '2026-11-17', allDay: true },
    { ...base, id: 'e3', title: 'Musculação', date: '2026-10-06', startTime: '18:00', endTime: '19:00', allDay: false, recurrence: { kind: 'weekly', weekdays: [1, 3, 5] } },
    { ...base, id: 'e4', title: 'Fatura', date: '2026-10-31', allDay: true, recurrence: { kind: 'monthly', dayOfMonth: 'last' } },
    { ...base, id: 'gone', title: 'Apagado lá', date: '2026-10-05', allDay: true, external: { provider: 'google', externalId: 'g', syncStatus: 'deleted_remotely' } },
  ]
  const ics = toICS(events)

  it('is a valid-looking VCALENDAR with CRLF, UID and DTSTAMP', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).not.toMatch(/[^\r]\n/)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4)
    expect(ics).toContain('UID:e1@marina-os')
    expect(ics).toMatch(/DTSTAMP:20261001T100000Z/)
    expect(ics).toContain('DTSTART:20261005T103000Z')
    expect(ics).toContain('DTEND;VALUE=DATE:20261118')
    expect(ics).toContain('SUMMARY:Yoga\\; com a Ana\\, no parque')
    expect(ics).toContain('DESCRIPTION:Levar tapete\\nE água')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')
    expect(ics).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=-1')
    expect(ics).not.toContain('Apagado lá')
  })

  it('round-trips through parseICS', () => {
    const back = parseICS(ics)
    const byTitle = Object.fromEntries(back.map((e) => [e.title, e]))
    expect(byTitle['Yoga; com a Ana, no parque']).toMatchObject({ date: '2026-10-05', startTime: '07:30', endTime: '08:30', location: 'Ibirapuera' })
    expect(byTitle['Recife ✈️']).toMatchObject({ date: '2026-11-14', endDate: '2026-11-17', allDay: true })
    expect(byTitle['Musculação'].recurrence).toEqual({ kind: 'weekly', weekdays: [1, 3, 5] })
    expect(byTitle['Fatura'].recurrence).toEqual({ kind: 'monthly', dayOfMonth: 'last' })
  })

  it('folds long lines at 75 octets without breaking UTF-8', () => {
    const line = 'SUMMARY:' + 'ção'.repeat(40)
    const folded = foldLine(line)
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(line)
  })

  it('escape/unescape are inverse', () => {
    const s = 'a;b,c\\d\ne'
    expect(unescapeText(escapeText(s))).toBe(s)
  })
})

describe('importICSText', () => {
  beforeEach(() => useStore.setState({ db: emptyDB(), hydrated: true }))

  it('creates an ics source + events and is idempotent', () => {
    const r1 = importICSText(GOOGLE, 'Google pessoal')
    const db = getDB()
    expect(db.calendarSources).toHaveLength(1)
    expect(db.calendarSources[0]).toMatchObject({ provider: 'ics', name: 'Google pessoal', enabled: true })
    expect(r1.created).toBe(4) // cancelled event is not created
    expect(db.events.every((e) => e.external?.provider === 'ics')).toBe(true)

    const r2 = importICSText(GOOGLE, 'google PESSOAL')
    expect(r2).toMatchObject({ created: 0, updated: 0, unchanged: 4 })
    expect(getDB().calendarSources).toHaveLength(1)
  })

  it('re-import: changed → updated, removed → hidden (not hard-deleted)', () => {
    importICSText(GOOGLE, 'G')
    const changed = GOOGLE.replace('SUMMARY:Reunião de produto', 'SUMMARY:Reunião de produto (nova sala)').replace(
      /BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261012[\s\S]*?END:VEVENT\r\n/,
      '',
    )
    const r = importICSText(changed, 'G')
    expect(r).toMatchObject({ updated: 1, deleted: 1 })
    const events = getDB().events
    expect(events.find((e) => e.external?.externalId === 'abc123@google.com')?.title).toBe('Reunião de produto (nova sala)')
    expect(events.find((e) => e.external?.externalId === 'feriado@google.com')?.external?.syncStatus).toBe('deleted_remotely')
  })

  it('does not duplicate the same iCalUID imported under another source', () => {
    importICSText(GOOGLE, 'Google')
    const r = importICSText(GOOGLE, 'Toki (cópia do Google)')
    expect(r.created).toBe(0)
    expect(getDB().events).toHaveLength(4)
  })

  it('rejects non-calendar text', () => {
    expect(() => importICSText('hello', 'x')).toThrow()
  })
})
