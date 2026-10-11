/**
 * UGC Business OS — Entrega 2 acceptance (message engine): the strategy picks 1–2 true contexts, the text
 * never invents experience or brand facts, avoids clichés, varies, fits the channel — and nothing is sent.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { actions, detachStorage, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { findBrand } from '@/data/ugc/model'
import { addBrandFact, approveMessage, ensureProspect, markMessageSent, saveDraft, setRelationship, updateBrand } from '@/data/ugc/ops'
import { buildStrategy, CHANNEL_SPEC, checkText, CLICHES } from '@/data/ugc/strategy'
import { composeDraft } from '@/data/ugc/compose'
import type { DB, UgcChannel } from '@/data/types'
import { normalize } from '@/lib/text'
import { pitchPayload, writeMessage } from '@/features/ugc/write'
import { whenSaved } from './act/commit'
import { ask, clearConversation, useConversation } from './conversation'

const MON = '2026-10-12'
const at = (date: string, hm = '10:00'): Now => {
  vi.setSystemTime(new Date(`${date}T${hm}:00.000-03:00`))
  const [h, m] = hm.split(':').map(Number)
  return { date, minutes: h * 60 + m, iso: new Date(`${date}T${hm}:00.000-03:00`).toISOString() }
}
let device: ReturnType<typeof createMemoryAdapter>
async function reopen(): Promise<DB> {
  await whenSaved()
  await flushNow()
  await hydrate(device)
  clearConversation()
  return getDB()
}
async function say(q: string) {
  ask(q, at(MON))
  await whenSaved()
  return useConversation.getState().exchanges.at(-1)!
}
const words = (t: string) => normalize(t).split(/[^a-z0-9]+/).filter(Boolean).length

function brand(name: string, p: Parameters<typeof updateBrand>[1] = {}) {
  const { brand: b } = ensureProspect(name)
  updateBrand(b.id, p)
  return getDB().brands.find((x) => x.id === b.id)!
}
const strategy = (name: string, channel: UgcChannel = 'dm') => buildStrategy(getDB(), findBrand(getDB(), name)!.id, channel, MON)!

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(MON, '08:00')
  device = createMemoryAdapter()
  await hydrate(device)
  actions.replaceDB(buildSeed(MON))
  await reopen()
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

describe('strategy — relevance over quantity', () => {
  it('Galápagos (outdoor): trekking / the South Africa trip, never IA or academia', () => {
    brand('Galápagos', { category: 'Outdoor', alreadyUsedProduct: false })
    const s = strategy('Galápagos')
    expect(s.talk.length).toBeLessThanOrEqual(2)
    expect(s.talk[0]).toBe('trekking')
    expect(s.talk.join(' ')).toMatch(/África do Sul/)
    expect(s.avoid).toEqual(expect.arrayContaining(['IA', 'musculação']))
    const d = composeDraft(s)
    expect(d.text).not.toMatch(/\bIA\b|academia|muscula/i)
  })

  it('Ocean Drop (suplementação): recovery / treino, no trekking or trip', () => {
    brand('Ocean Drop', { category: 'Suplementação', alreadyCustomer: true })
    const s = strategy('Ocean Drop')
    expect(s.talk).toEqual(['rotina real de treino', 'triathlon'])
    expect(s.angle).toMatch(/recovery/)
    expect(s.trip).toBeUndefined()
    expect(composeDraft(s).text).not.toMatch(/trekking|áfrica/i)
  })

  it('no category: says what is missing instead of guessing', () => {
    brand('Marca X', { alreadyUsedProduct: false })
    const s = strategy('Marca X')
    expect(s.missing).toContain('categoria')
    expect(s.talk).toEqual([])
  })
})

describe('truth — nothing invented', () => {
  it('never used → "conheci recentemente"/"tenho acompanhado"-style, never "uso há meses"', () => {
    brand('Galápagos', { category: 'Outdoor', alreadyUsedProduct: false, alreadyCustomer: false })
    const s = strategy('Galápagos')
    for (let v = 0; v < 10; v++) {
      const t = composeDraft(s, v).text
      expect(t).not.toMatch(/uso há|há meses|há anos|sempre fui fã|já faz parte da minha rotina|sou cliente|já usei/i)
    }
    expect(checkText(s, 'Oi! Uso há meses os produtos de vocês e amo.').issues).toContain('afirma uma experiência que não está registrada')
    expect(checkText(s, 'Oi! Sempre fui fã de vocês.').issues).toContain('afirma uma experiência que não está registrada')
  })

  it('"já sou cliente" only when it is registered', () => {
    brand('Ocean Drop', { category: 'Suplementação' })
    setRelationship(findBrand(getDB(), 'Ocean Drop')!.id, { alreadyUsedProduct: false, alreadyCustomer: false })
    expect(composeDraft(strategy('Ocean Drop')).text).not.toMatch(/cliente/i)
    setRelationship(findBrand(getDB(), 'Ocean Drop')!.id, { alreadyCustomer: true })
    const variants = Array.from({ length: 4 }, (_, v) => composeDraft(strategy('Ocean Drop'), v).text)
    expect(variants.some((t) => /cliente/i.test(t))).toBe(true)
  })

  it('no brand fact → a warning and no praise; with a fact → it is used, with its source', () => {
    brand('Nomad', { category: 'Fintech', alreadyUsedProduct: false })
    const s = strategy('Nomad')
    expect(s.missing).toContain('fato')
    expect(s.warnings).toContain('Falta um detalhe específico da marca para personalizar melhor.')
    expect(composeDraft(s).text).not.toMatch(/me chamou atenção|gostei de ver|o que mais me pegou/i)
    addBrandFact(findBrand(getDB(), 'Nomad')!.id, { text: 'o cartão sem IOF pra viagem', source: 'site', sourceUrl: 'https://nomadglobal.com' })
    const s2 = strategy('Nomad')
    expect(s2.fact).toMatchObject({ source: 'site', verified: true })
    expect(composeDraft(s2).text).toMatch(/cartão sem IOF/)
  })

  it('relationship unknown → Lumos asks ONE question before writing', async () => {
    brand('Galápagos', { category: 'Outdoor' })
    const e = await say('gera uma DM pra Galápagos')
    const r = e.lumos!.reply
    expect(r.text).toMatch(/já usou Galápagos\?/)
    expect(r.options?.map((o) => o.label)).toEqual(['Já usei', 'Nunca usei'])
    expect(r.action).toBeUndefined()
    await say('nunca usei Galápagos')
    const db = await reopen()
    expect(findBrand(db, 'Galápagos')).toMatchObject({ alreadyUsedProduct: false })
    const r2 = (await say('gera uma DM pra Galápagos')).lumos!.reply
    expect(r2.text).toMatch(/Rascunho de DM pra Galápagos — nada foi enviado/)
    expect(r2.sections?.[0].lines.map((l) => l.text)[0]).toMatch(/trekking/)
    const db2 = await reopen()
    expect(db2.ugcMessages).toHaveLength(1)
    expect(db2.ugcMessages[0]).toMatchObject({ status: 'rascunho', channel: 'dm' })
    expect(db2.ugcInteractions).toHaveLength(0) // nothing sent, no contact logged
  })
})

describe('tone & variety', () => {
  it('10 consecutive messages: no repeated opening, no clichés', () => {
    const names = ['Galápagos', 'Ocean Drop', 'Nomad', 'Snug', 'Track&Field', 'Keep Running', 'Oakberry', 'Mormaii', 'Vivo Run', 'Garmin']
    const cats = ['Outdoor', 'Suplementação', 'Fintech', 'Moda esportiva', 'Moda esportiva', 'Corrida', 'Nutrição', 'Surf', 'Corrida', 'Tecnologia']
    const openings: string[] = []
    names.forEach((n, i) => {
      brand(n, { category: cats[i], alreadyUsedProduct: false })
      const s = strategy(n)
      const d = composeDraft(s, i)
      expect(d.issues).toEqual([])
      for (const c of CLICHES) expect(normalize(d.text)).not.toContain(c)
      openings.push(normalize(d.text).split(/\s+/).slice(0, 5).join(' '))
      saveDraft(s, d.text)
    })
    expect(new Set(openings).size).toBe(openings.length)
  })

  it('channel shapes: DM short without links, e-mail with subject + portfolio, WhatsApp shortest', () => {
    brand('Galápagos', { category: 'Outdoor', alreadyUsedProduct: false, instagram: '@galapagos' })
    const dm = composeDraft(strategy('Galápagos', 'dm'))
    expect(words(dm.text)).toBeLessThanOrEqual(CHANNEL_SPEC.dm.max * 1.25)
    expect(dm.text).not.toMatch(/https?:|\.app|\.com/)
    expect(dm.subject).toBeUndefined()
    const mail = composeDraft(strategy('Galápagos', 'email'))
    expect(mail.subject).toBeTruthy()
    expect(mail.text).toMatch(/marinacollier-ugc\.lovable\.app/)
    expect(mail.text).toMatch(/Marina Collier$/)
    const wa = composeDraft(strategy('Galápagos', 'whatsapp'))
    expect(words(wa.text)).toBeLessThanOrEqual(CHANNEL_SPEC.whatsapp.max * 1.25)
  })
})

describe('history — rascunho → aprovada → enviada (she sends, the app never does)', () => {
  it('copy approves, "Mandei" logs the contact and starts the cadence; all survives a restart', async () => {
    brand('Galápagos', { category: 'Outdoor', alreadyUsedProduct: false })
    const s = strategy('Galápagos')
    const d = composeDraft(s)
    const { message } = saveDraft(s, d.text)
    expect(getDB().ugcInteractions).toHaveLength(0)
    approveMessage(message.id, `${d.text} Até mais!`)
    let db = await reopen()
    expect(db.ugcMessages[0]).toMatchObject({ status: 'aprovada', approvedText: `${d.text} Até mais!` })
    markMessageSent(message.id, { date: MON })
    db = await reopen()
    const m = db.ugcMessages[0]
    expect(m).toMatchObject({ status: 'enviada', sentText: `${d.text} Até mais!` })
    expect(m.opportunityId).toBeTruthy()
    expect(db.ugcInteractions).toHaveLength(1)
    expect(db.ugcInteractions[0]).toMatchObject({ direction: 'out', type: 'primeiro_contato', content: `${d.text} Até mais!` })
    expect(db.ugcOpportunities.find((o) => o.id === m.opportunityId)).toMatchObject({ stage: 'contatada', nextFollowUpAt: '2026-10-15' })
    // the next message for anyone avoids this opening
    expect(strategy('Galápagos').recentOpenings[0]).toBe(normalize(d.text).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5).join(' '))
  })
})

describe('server path (Claude via lumos-pitch) — mocked', () => {
  it('sends only the strategy (no ids), re-checks the text, retries once with the issues, then falls back', async () => {
    brand('Galápagos', { category: 'Outdoor', alreadyUsedProduct: false })
    const s = strategy('Galápagos')
    const payload = pitchPayload(s)
    expect(JSON.stringify(payload)).not.toMatch(/"id"/)
    expect(payload.strategy.relationship).toMatch(/nunca usou/)

    const good = 'Oi, time Galápagos! Sou a Marina, faço trekking e vou gravar na África do Sul em outubro. Conheci vocês recentemente. Pensei em um conteúdo de trilha real com a mochila de vocês. Posso te mandar uma ideia?'
    const ok = await writeMessage(s, { useServer: true, call: async () => ({ subject: null, message: good }) })
    expect(ok).toMatchObject({ by: 'lumos', text: good })

    const calls: (string[] | undefined)[] = []
    const fixed = await writeMessage(s, {
      useServer: true,
      call: async (body) => {
        calls.push(body.feedback)
        return { subject: null, message: calls.length === 1 ? 'Oi! Uso há meses e seria uma honra trabalhar com vocês.' : good }
      },
    })
    expect(fixed.by).toBe('lumos')
    expect(calls[1]).toEqual(expect.arrayContaining(['clichê: “seria uma honra”', 'afirma uma experiência que não está registrada']))

    const bad = await writeMessage(s, { useServer: true, call: async () => ({ subject: null, message: 'Sinergia total, sempre fui fã!' }) })
    expect(bad.by).toBe('local')
    expect(bad.note).toMatch(/não passou na checagem/)

    const offline = await writeMessage(s, { useServer: true, call: async () => Promise.reject(new Error('net')) })
    expect(offline.by).toBe('local')
    expect(offline.issues).toEqual([])
  })
})
