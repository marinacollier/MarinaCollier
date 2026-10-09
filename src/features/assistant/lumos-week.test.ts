/**
 * "Um dia da Marina" and "Uma semana da Marina": what she'd really do, through Lumos and the same
 * writers the screens use, with the app closed and reopened from the device along the way.
 * At the end Lumos must tell the week from the real state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { actions, detachStorage, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { dayTimeline } from '@/data/timeline'
import { ensureReceivables, receivableId } from '@/data/finance/receivables'
import { workMode } from '@/data/planning'
import { FINANCE_SEED_IDS } from '@/features/finance/seed'
import { importICSText } from '@/integrations/ics'
import { makeBackup, validateBackup } from '@/features/settings/backup'
import { unlockSession } from '@/app/lock-store'
import { addDays } from '@/lib/date'
import type { DB } from '@/data/types'
import { whenSaved } from './act/commit'
import { ask, chooseAdjust, clearConversation, confirmAdjust, confirmReply, runOption, useConversation, type Exchange } from './conversation'

const MON = '2026-10-12'
let device: ReturnType<typeof createMemoryAdapter>

function at(date: string, hm: string): Now {
  vi.setSystemTime(new Date(`${date}T${hm}:00.000-03:00`))
  const [h, m] = hm.split(':').map(Number)
  return { date, minutes: h * 60 + m, iso: new Date(`${date}T${hm}:00.000-03:00`).toISOString() }
}
async function say(q: string, now: Now): Promise<Exchange> {
  const id = ask(q, now)!
  await whenSaved()
  let e = useConversation.getState().exchanges.find((x) => x.id === id)!
  if (e.lumos?.status === 'pending') confirmReply(id)
  if (e.adjust?.status === 'preview' && !e.adjust.plan.needsChoice) confirmAdjust(id)
  await whenSaved()
  e = useConversation.getState().exchanges.find((x) => x.id === id)!
  const st = e.lumos?.status ?? e.adjust?.status ?? e.food?.status ?? 'answer'
  expect(st, q).not.toMatch(/saving|failed/)
  return e
}
async function reopen(): Promise<DB> {
  await whenSaved()
  await flushNow()
  await hydrate(device)
  clearConversation()
  return getDB()
}
const text = (e: Exchange) => [e.lumos?.reply.text, ...(e.lumos?.reply.lines ?? []).map((l) => l.text), e.adjust?.plan.doneTitle].filter(Boolean).join(' | ')

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(MON, '04:45')
  device = createMemoryAdapter()
  await hydrate(device)
  actions.replaceDB(buildSeed(MON))
  ensureReceivables(MON)
  await reopen()
  unlockSession()
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

describe('um dia da Marina (segunda)', () => {
  it('manhã → trabalho → comida → dinheiro → carreira → noite, then close and reopen: all there', async () => {
    // Manhã: abre o app, briefing, marca rotina, registra treino.
    const brief = await say('bom dia', at(MON, '04:45'))
    expect(text(brief)).toMatch(/\S/)
    const morning = dayTimeline(getDB(), MON).filter((e) => e.ref.type === 'routineItem' && e.start && e.start < '06:00').slice(0, 2)
    for (const e of morning) actions.toggleOccurrence('routineItem', e.ref.id, MON)
    await say('terminei a natação', at(MON, '07:05'))
    // Trabalho: Top 3, marca tarefa, Waiting For, win.
    await say('organiza meu dia', at(MON, '09:00'))
    await say('preciso lembrar de mandar o roadmap pro board', at(MON, '09:10'))
    await say('essa tarefa já fiz', at(MON, '11:30'))
    await say('Fran ficou de me responder quinta', at(MON, '11:40'))
    const win = await say('isso foi um baita resultado no FashionFinder', at(MON, '15:00'))
    runOption(win.lumos!.reply.options![0])
    // Comida, dinheiro, carreira.
    const meal = await say('comi um yopro', at(MON, '16:00'))
    if (meal.food?.status === 'resolving') {
      const { logFood } = await import('./conversation')
      logFood(meal.id, [{ name: 'YoPRO', qty: 1, confidence: 'estimated' }], [])
      await whenSaved()
    }
    const money = await say('quanto tenho previsto este mês?', at(MON, '18:30'))
    expect(text(money)).toMatch(/R\$\s30\.000,00 previstos/)
    await say('registra 30 min de inglês executivo hoje', at(MON, '19:30'))
    // Noite: vê amanhã.
    const tomorrow = await say('o que eu tenho amanhã?', at(MON, '21:00'))
    expect(text(tomorrow)).toMatch(/\S/)

    const db = await reopen()
    expect(db.occurrences.filter((o) => o.parentType === 'routineItem' && o.date === MON).length).toBe(morning.length)
    expect(db.workouts.find((w) => w.date === MON && w.modality === 'natacao')?.status).toBe('feito')
    expect(db.priorities.filter((p) => p.date === MON).length).toBeGreaterThan(0)
    expect(db.tasks.find((t) => /mandar o roadmap/i.test(t.title))?.status).toBe('done')
    expect(db.tasks.filter((t) => t.status === 'waiting' && t.waiting?.who === 'Fran')).toHaveLength(1)
    expect(db.wins.some((w) => w.date === MON)).toBe(true)
    expect(db.meals.some((m) => m.date === MON && /yopro/i.test(m.description ?? ''))).toBe(true)
    expect(db.lifeLog.some((e) => /Inglês executivo/.test(e.title))).toBe(true)
  })
})

describe('uma semana da Marina', () => {
  it('treino muda, presencial, yoga, inglês cancelado, evento importado, follow-up, recebimento, livro, vaga, backup → "o que aconteceu essa semana?"', async () => {
    // Seg: a natação vai pra terça.
    await say('passa minha natação de segunda pra terça', at(MON, '05:30'))
    // Seg à noite: amanhã presencial (já é presencial na base de terça? então quinta).
    const thu = addDays(MON, 3)
    await say('quinta vou presencial', at(MON, '20:00'))
    expect(workMode(getDB(), thu)).toBe('presencial')
    // Agenda importada (.ics) — a Daily Briefing import does not exist; the calendar import is the real one.
    importICSText(
      ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:board-1@corp', 'DTSTART:20261014T170000Z', 'DTEND:20261014T180000Z', 'SUMMARY:Board prep', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'),
      'Trabalho',
    )
    // Ter: yoga feita.
    await say('já fiz yoga hoje', at(addDays(MON, 1), '20:00'))
    // Inglês: a placed session cancelled (week planned without Cerâmica so there's room).
    for (const ev of getDB().events.filter((x) => /cer[aâ]mica/i.test(x.title))) actions.remove('events', ev.id)
    await say('monta minha semana', at(addDays(MON, 1), '21:00'))
    const eng = getDB().tasks.filter((t) => t.careerKind === 'ingles_exec' && t.careerParentId && t.date).sort((a, b) => a.date!.localeCompare(b.date!))[0]
    if (eng) {
      const e = await say('amanhã cancelei meu inglês', at(addDays(eng.date!, -1), '21:00'))
      const opt = e.adjust?.plan.needsChoice?.options.find((o) => o.label.includes(eng.time!))
      if (opt) {
        chooseAdjust(e.id, opt.plan)
        await whenSaved()
      }
    }
    // Qua: follow-up, vaga, recebimento.
    const wed = addDays(MON, 2)
    await say('Fran ficou de me responder sexta', at(wed, '10:00'))
    await say('adiciona uma vaga de Head of Product na empresa X', at(wed, '12:00'))
    await say('recebi o Santander hoje', at(wed, '14:00'))
    // Qui: livro terminado.
    await say('terminei meu livro', at(thu, '22:00'))
    await reopen()
    // Sex: backup (export → validates).
    at(addDays(MON, 4), '18:00')
    const file = JSON.parse(JSON.stringify(makeBackup(getDB())))
    expect(validateBackup(file).ok).toBe(true)

    // Domingo à noite: o que aconteceu?
    const week = await say('o que aconteceu essa semana?', at(addDays(MON, 6), '20:00'))
    const all = [week.lumos?.reply.text, ...(week.lumos?.reply.lines ?? []).map((l) => l.text)].join(' | ')
    expect(week.lumos?.reply.area).toBe('o que mudou')
    for (const piece of [/Natação|natacao/i, /Yoga/i, /Santander/, /Head of Product · Empresa X/, /Fran/, /Terminou|Fechou|finaliz/i])
      expect(all + ' ' + JSON.stringify(week.lumos?.reply), String(piece)).toMatch(piece)
    expect(all).not.toMatch(/Gasto: Santander/)
    const db = getDB()
    expect(db.expenses.find((e) => e.id === receivableId(FINANCE_SEED_IDS.contractSantander, '2026-10'))?.status).toBe('received')
    expect(db.events.some((e) => e.title === 'Board prep')).toBe(true)
  })
})
