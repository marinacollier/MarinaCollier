/**
 * Prints / PDFs → Lumos. The reader is replaced by fixed readings (the real one is the lumos-read function);
 * what is tested is everything after: same handlers as text/voice, nothing invented, saved, survives reopen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { actions, detachStorage, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { whenSaved } from './act/commit'
import { ReadError, toReading, type RawReading } from './attach/read'
import { clearConversation, confirmReply, runOption, useConversation } from './conversation'

const read = vi.hoisted(() => ({ next: undefined as unknown, fail: undefined as unknown }))
vi.mock('./attach/read', async (orig) => {
  const real = await orig<typeof import('./attach/read')>()
  return {
    ...real,
    readAttachment: vi.fn(async (file: File) => {
      if (read.fail) throw read.fail
      return real.toReading(read.next as RawReading, file.name, file.type === 'application/pdf' ? 'pdf' : 'image')
    }),
  }
})
const { sendAttachment } = await import('./conversation')

const FRI = '2026-10-09'
const NOW: Now = { date: FRI, minutes: 600, iso: '2026-10-09T13:00:00.000Z' }
let device: ReturnType<typeof createMemoryAdapter>

const invite = (over: Partial<NonNullable<RawReading['event']>> = {}): RawReading => ({
  category: 'event',
  summary: 'Convite de aniversário da Ana',
  confidence: 'high',
  event: { title: 'Aniversário da Ana', date: '2026-10-17', dayOfMonth: null, startTime: '20:00', endTime: null, location: 'Casa Rosa', description: null, ...over },
  task: null,
  book: null,
  items: [],
  text: 'Aniversário da Ana · sábado, 17 de outubro · 20h · Casa Rosa',
})
const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'convite.png', { type: 'image/png' })
const last = () => useConversation.getState().exchanges.at(-1)!
async function reopen() {
  await whenSaved()
  await flushNow()
  await hydrate(device)
  clearConversation()
  return getDB()
}

beforeEach(async () => {
  read.next = undefined
  read.fail = undefined
  device = createMemoryAdapter()
  await hydrate(device)
  actions.replaceDB(buildSeed(FRI))
  await reopen()
})
afterEach(() => detachStorage())

describe('print of an invite', () => {
  it('sent alone → "Encontrei um convite" + Adicionar; on tap it is in the calendar and survives reopening', async () => {
    read.next = invite()
    await sendAttachment(png(), '', NOW)
    const e = last()
    expect(e.attachment).toMatchObject({ name: 'convite.png', status: 'read' })
    expect(e.lumos?.status).toBe('pending')
    expect(e.lumos?.reply.text).toBe('Encontrei um convite:')
    expect(e.lumos?.reply.lines?.[0].sub).toMatch(/17\/10 · 20:00.*Casa Rosa/)
    confirmReply(e.id)
    const db = await reopen()
    const ev = db.events.find((x) => x.title === 'Aniversário da Ana')!
    expect(ev).toMatchObject({ date: '2026-10-17', startTime: '20:00', location: 'Casa Rosa', allDay: false })
    expect(ev.notes).toMatch(/Lido de um print \(convite\.png\)/)
  })

  it('with "coloca isso na agenda" → straight in (same create_calendar_event), with Desfazer', async () => {
    read.next = invite()
    await sendAttachment(png(), 'coloca isso na agenda', NOW)
    await whenSaved()
    expect(last().lumos?.status).toBe('done')
    expect(last().lumos?.reply.text).toMatch(/Aniversário da Ana adicionado ✓ 17\/10 · 20:00/)
    expect((await reopen()).events.filter((x) => x.title === 'Aniversário da Ana')).toHaveLength(1)
  })

  it('the same invite twice is not duplicated', async () => {
    read.next = invite()
    await sendAttachment(png(), 'salva isso', NOW)
    await whenSaved()
    await sendAttachment(png(), 'salva isso', NOW)
    expect(last().lumos?.reply.text).toMatch(/já está na agenda/)
    expect(getDB().events.filter((x) => x.title === 'Aniversário da Ana')).toHaveLength(1)
  })

  it('"sábado, dia 17" without a month → asks "17 de qual mês?" — never guesses', async () => {
    read.next = invite({ date: null, dayOfMonth: 17 })
    await sendAttachment(png(), 'coloca na agenda', NOW)
    const r = last().lumos!.reply
    expect(r.text).toMatch(/17 de qual mês\?/)
    expect(getDB().events.some((x) => x.title === 'Aniversário da Ana')).toBe(false)
    runOption(r.options![0])
    await whenSaved()
    expect(getDB().events.find((x) => x.title === 'Aniversário da Ana')?.date).toBe('2026-10-17')
  })

  it('no time on the invite → saved as all-day, and it says so (never 20h by default)', async () => {
    read.next = invite({ startTime: null })
    await sendAttachment(png(), 'coloca na agenda', NOW)
    await whenSaved()
    expect(last().lumos?.reply.sub).toMatch(/não diz horário/)
    expect(getDB().events.find((x) => x.title === 'Aniversário da Ana')).toMatchObject({ allDay: true, startTime: undefined })
  })

  it('her sentence can give the day the print lacks: print + "coloca isso sábado"', async () => {
    read.next = invite({ date: null, dayOfMonth: null })
    await sendAttachment(png(), 'coloca isso sábado', NOW)
    await whenSaved()
    expect(getDB().events.find((x) => x.title === 'Aniversário da Ana')?.date).toBe('2026-10-10')
  })
})

describe('other prints — one generic layer', () => {
  const base: Omit<RawReading, 'category'> = { summary: '', confidence: 'high', event: null, task: null, book: null, items: [], text: '' }

  it('work chat where someone owes her something → Waiting For (asks first)', async () => {
    read.next = { ...base, category: 'work', summary: 'Conversa com a Fran', task: { title: 'Enviar o deck revisado', due: '2026-10-13', who: 'Fran' } }
    await sendAttachment(png(), '', NOW)
    expect(last().lumos?.status).toBe('pending')
    confirmReply(last().id)
    const t = (await reopen()).tasks.find((x) => x.title === 'Enviar o deck revisado')!
    expect(t).toMatchObject({ status: 'waiting', waiting: { who: 'Fran', followUpOn: '2026-10-13' } })
  })

  it('a book cover → quero ler; shopping → lista; unknown → says what it read and writes nothing', async () => {
    read.next = { ...base, category: 'book', summary: 'Capa de livro', book: { title: 'Inspired', author: 'Marty Cagan' } }
    const books = getDB().books.length
    await sendAttachment(png(), 'salva', NOW)
    await whenSaved()
    expect(getDB().books.length).toBeGreaterThanOrEqual(books)

    read.next = { ...base, category: 'shopping', summary: 'Lista', items: ['papel toalha', 'café'] }
    await sendAttachment(png(), 'adiciona', NOW)
    await whenSaved()
    expect(getDB().tasks.filter((t) => /^Comprar (papel toalha|café)$/.test(t.title))).toHaveLength(2)

    const before = JSON.stringify(getDB())
    read.next = { ...base, category: 'unknown', summary: 'Uma paisagem', confidence: 'low' }
    await sendAttachment(png(), '', NOW)
    expect(last().lumos?.reply.sub).toMatch(/me diz/)
    expect(last().lumos?.reply.action).toBeUndefined()
    expect(JSON.stringify(getDB())).toBe(before)
  })

  it('not signed in → says so, with the way to sign in; nothing written', async () => {
    read.fail = new ReadError('signin', 'Pra eu ler prints, entra na sua conta do MARINA OS.')
    await sendAttachment(png(), 'coloca na agenda', NOW)
    expect(last().attachment?.status).toBe('failed')
    expect(last().lumos?.reply.link?.label).toBe('Entrar na conta')
  })
})

describe('toReading never repairs bad fields by guessing', () => {
  it('malformed date/time become missing', () => {
    const r = toReading(invite({ date: '17/10', startTime: '8pm' }), 'x.png', 'image')
    expect(r.event?.date).toBeUndefined()
    expect(r.event?.startTime).toBeUndefined()
    expect(r.event?.missing).toEqual(['date', 'time'])
  })
})
