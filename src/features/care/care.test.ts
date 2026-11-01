import { beforeEach, describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import { isPrivateCollection, PRIVATE_COLLECTIONS } from '@/data/private-collections'
import { buildSeed } from '@/data/seed'
import { getDB, useStore } from '@/data/store'
import { syncCollections } from '@/data/sync/engine'
import type { DB } from '@/data/types'
import { crisisReply } from '@/features/assistant/act/handlers/care'
import { respond } from '@/features/assistant/act/respond'
import { clausesOf, understand } from '@/features/assistant/router'
import { COLLECTION_KEYS, makeBackup } from '@/features/settings/backup'
import { CSV_DATASET_SOURCES, CSV_DATASETS, datasetCSV } from '@/features/settings/csv'
import { favoriteIds, prefId, prefOf, registerUse, savePauseDraft, saveSupportPlan, setPreference, SUPPORT_PLAN_ID, supportPlan, toggleFavorite } from './ops'
import { mailtoUrl, PAUSE_CONTEXTS, PAUSE_INTENTS, PAUSE_TONES, parsePauseRequest, pauseLink, pauseMessage, whatsappUrl } from './pause'
import { QUICK_OPTIONS, quickTechniques } from './quick'
import { HELP_LINES, hasCrisisSignal } from './support'
import { GROUNDING_STEPS, TECHNIQUES } from './techniques'

const CARE = ['careTechniquePrefs', 'carePauseDrafts', 'careSupportPlan'] as const
const NOW = { date: '2026-11-01', minutes: 600 }

describe('técnicas (conteúdo estático)', () => {
  it('todas têm os campos obrigatórios e uma fonte', () => {
    expect(TECHNIQUES.length).toBeGreaterThanOrEqual(12)
    const ids = new Set<string>()
    for (const t of TECHNIQUES) {
      for (const f of ['id', 'name', 'approach', 'purpose', 'whenHelps', 'whenAvoidOrAdapt', 'duration', 'shortVersion', 'source'] as const) expect(t[f]?.trim(), `${t.id}.${f}`).toBeTruthy()
      expect(t.steps.length, t.id).toBeGreaterThanOrEqual(3)
      expect(['DBT', 'TCC', 'ACT', 'mindfulness', 'ativação comportamental']).toContain(t.approach)
      expect(ids.has(t.id)).toBe(false)
      ids.add(t.id)
    }
  })

  it('fontes verificáveis (livro e ano); o 5-4-3-2-1 sem autoria inventada', () => {
    for (const t of TECHNIQUES.filter((x) => x.id !== 'aterramento-54321')) expect(t.source, t.id).toMatch(/\((?:[^)]*)\b(19|20)\d{2}\)/)
    expect(TECHNIQUES.find((t) => t.id === 'aterramento-54321')!.source).toMatch(/amplamente usada/)
  })

  it('cobre as técnicas pedidas', () => {
    for (const id of ['aterramento-54321', 'stop', 'tipp', 'checar-fatos', 'mente-sabia', 'acao-oposta', 'tolerancia-mal-estar', 'dear-man', 'give-fast', 'ativacao-comportamental', 'registro-pensamentos', 'desfusao'])
      expect(TECHNIQUES.some((t) => t.id === id), id).toBe(true)
  })

  it('TIPP tem os cuidados: água fresca (não extrema), sem esforço intenso, joelho, condição cardíaca', () => {
    const tipp = TECHNIQUES.find((t) => t.id === 'tipp')!
    const all = `${tipp.whenAvoidOrAdapt} ${tipp.steps.join(' ')}`
    expect(all).toMatch(/água fresca/i)
    expect(all).toMatch(/nunca gelo|não gelada/i)
    expect(all).toMatch(/joelho/i)
    expect(all).toMatch(/card[ií]aca/i)
    expect(all).toMatch(/nada de esforço intenso|em vez de exercício intenso/i)
  })

  it('o 5-4-3-2-1 guiado tem 5 passos, de 5 a 1', () => {
    expect(GROUNDING_STEPS.map((s) => s.count)).toEqual([5, 4, 3, 2, 1])
  })
})

describe('linguagem', () => {
  const corpus = () =>
    JSON.stringify([
      TECHNIQUES,
      QUICK_OPTIONS,
      HELP_LINES,
      PAUSE_INTENTS.flatMap((i) => PAUSE_TONES.flatMap((t) => PAUSE_CONTEXTS.map((c) => pauseMessage({ context: c.value, intent: i.value, tone: t.value })))),
      crisisReply(),
    ])
  it('sem "borderline", sem "diagnóstico", sem rótulos', () => {
    const text = corpus().toLowerCase()
    for (const w of ['borderline', 'diagnóstico', 'diagnostico', 'transtorno', 'tpb']) expect(text, w).not.toContain(w)
  })
  it('sem orientação sobre remédios', () => {
    expect(corpus().toLowerCase()).not.toMatch(/medica[çc][aã]o|medicamento|rem[ée]dio|dose\b/)
  })
})

describe('acesso rápido "Preciso me acalmar"', () => {
  it('as 8 opções existem e cada uma tem 2–3 técnicas reais', () => {
    expect(QUICK_OPTIONS.map((q) => q.id)).toEqual(['ansiosa', 'ruminando', 'impulsiva', 'triste', 'rejeicao', 'raiva', 'escrever', 'conversar'])
    for (const q of QUICK_OPTIONS) {
      const ts = quickTechniques(q.id)
      expect(ts.length, q.id).toBe(q.techniqueIds.length)
      expect(ts.length, q.id).toBeGreaterThanOrEqual(2)
      expect(ts.length, q.id).toBeLessThanOrEqual(3)
    }
  })
  it('impulso leva ao Modo Pausa; escrever é o rascunho não salvo; conversar leva ao plano de apoio', () => {
    const by = (id: string) => QUICK_OPTIONS.find((q) => q.id === id)!
    expect(by('impulsiva').link?.to).toContain('v=pausa')
    expect(by('escrever').kind).toBe('write')
    expect(by('escrever').intro).toMatch(/ainda não está disponível/)
    expect(by('conversar').kind).toBe('talk')
    expect(by('conversar').link?.to).toContain('v=apoio')
  })
})

describe('Modo Pausa', () => {
  it('todas as combinações geram texto, e nenhuma fala em envio automático', () => {
    let n = 0
    for (const c of PAUSE_CONTEXTS)
      for (const i of PAUSE_INTENTS)
        for (const t of PAUSE_TONES) {
          const m = pauseMessage({ context: c.value, intent: i.value, tone: t.value, name: 'Marina' })
          expect(m.trim().length, `${c.value}/${i.value}/${t.value}`).toBeGreaterThan(10)
          expect(m.toLowerCase()).not.toMatch(/envi(ad|ei|ando)|enviar automaticamente|mensagem autom[aá]tica/)
          n++
        }
    expect(n).toBe(8 * 7 * 4)
  })
  it('o canal muda forma e tamanho: e-mail com saudação e despedida, Instagram o mais curto', () => {
    const base = { intent: 'tempo', tone: 'delicado' } as const
    const email = pauseMessage({ ...base, context: 'email', name: 'Marina' })
    expect(email).toMatch(/^Oi, tudo bem\?/)
    expect(email).toMatch(/Um abraço,\nMarina$/)
    expect(pauseMessage({ ...base, tone: 'profissional', context: 'email' })).toMatch(/Atenciosamente,$/)
    const insta = pauseMessage({ ...base, context: 'instagram' })
    expect(insta.length).toBeLessThan(pauseMessage({ ...base, context: 'whatsapp' }).length)
    expect(insta.length).toBeLessThan(email.length)
  })
  it('os links só abrem o app com o texto (ela envia)', () => {
    expect(whatsappUrl('oi & tchau')).toBe('https://wa.me/?text=oi%20%26%20tchau')
    expect(mailtoUrl('a\nb')).toBe('mailto:?body=a%0Ab')
  })
  it('entende um pedido em texto livre', () => {
    expect(parsePauseRequest('minha mae pedindo tempo para pensar')).toEqual({ intent: 'tempo', context: 'familia' })
    expect(parsePauseRequest('meu chefe dizendo que retomamos amanha')).toEqual({ intent: 'retomar_amanha', context: 'profissional' })
    expect(pauseLink({ intent: 'limite' })).toBe('/cuidar?v=pausa&intencao=limite')
  })
})

describe('preferências e coleções privadas', () => {
  beforeEach(() => useStore.setState({ db: emptyDB() }))

  it('são privadas: fora do Supabase, só no store dela quando incluído', () => {
    for (const k of CARE) {
      expect(isPrivateCollection(k), k).toBe(true)
      expect(PRIVATE_COLLECTIONS.has(k)).toBe(true)
    }
    const db = emptyDB()
    for (const k of CARE) expect(syncCollections(db)).not.toContain(k)
    for (const k of CARE) expect(syncCollections(db, true)).toContain(k)
  })

  it('ficam fora das exportações genéricas (CSV) e dentro do backup completo, como o Ateliê', async () => {
    for (const id of CSV_DATASETS.map((d) => d.id)) for (const k of CSV_DATASET_SOURCES[id]) expect(isPrivateCollection(k), `${id}:${k}`).toBe(false)
    toggleFavorite('stop')
    await savePauseDraft({ context: 'pessoal', intent: 'tempo', tone: 'neutro', text: 'SEGREDO-PAUSA-123' })
    saveSupportPlan({ whatHelps: 'SEGREDO-PLANO-456', contacts: [{ name: 'Ana', phone: '+55 11 99999-0000' }] })
    const db = getDB()
    for (const d of CSV_DATASETS) {
      const csv = datasetCSV(db, d.id)
      expect(csv).not.toContain('SEGREDO')
      expect(csv).not.toContain('care-pref')
    }
    for (const k of CARE) expect(COLLECTION_KEYS).toContain(k)
    const backup = JSON.stringify(makeBackup(db))
    expect(backup).toContain('SEGREDO-PAUSA-123')
    expect(backup).toContain('SEGREDO-PLANO-456')
  })

  it('ids determinísticos por técnica; favorito, preferência e uso manual', () => {
    expect(toggleFavorite('stop')).toBe(true)
    expect(prefOf('stop')!.id).toBe(prefId('stop'))
    setPreference('stop', 'ajuda')
    expect(prefOf('stop')!.preference).toBe('ajuda')
    setPreference('stop', 'ajuda')
    expect(prefOf('stop')!.preference).toBeUndefined()
    expect(prefOf('stop')!.usedAt).toEqual([])
    const undo = registerUse('stop', '2026-11-01T10:00:00.000Z')
    expect(prefOf('stop')!.usedAt).toEqual(['2026-11-01T10:00:00.000Z'])
    undo()
    expect(prefOf('stop')!.usedAt).toEqual([])
    expect(getDB().careTechniquePrefs).toHaveLength(1)
    expect(favoriteIds()).toEqual(['stop'])
    toggleFavorite('stop')
    expect(favoriteIds()).toEqual([])
  })

  it('o plano de apoio é um registro só', () => {
    saveSupportPlan({ warningSigns: 'a' })
    saveSupportPlan({ whatHelps: 'b' })
    expect(getDB().careSupportPlan).toHaveLength(1)
    expect(supportPlan()).toMatchObject({ id: SUPPORT_PLAN_ID, warningSigns: 'a', whatHelps: 'b' })
  })

  it('rascunho vazio não é gravado', async () => {
    expect((await savePauseDraft({ context: 'pessoal', intent: 'tempo', tone: 'neutro', text: '  ' })).ok).toBe(false)
    expect(getDB().carePauseDrafts).toHaveLength(0)
  })
})

describe('Lumos — Cuidar de Mim', () => {
  const db = (): DB => buildSeed('2026-11-01')
  const say = (text: string, base: DB = db()) => respond(base, text, NOW)

  it('sinais de crise: ajuda humana PRIMEIRO, antes de qualquer handler', () => {
    for (const s of ['quero morrer', 'Não aguento mais viver', 'tenho pensado em suicídio', 'tenho vontade de me machucar', 'acordei agora e quero morrer']) {
      expect(hasCrisisSignal(s), s).toBe(true)
      const r = say(s)!
      expect(r.area, s).toBe('cuidar de mim')
      const all = JSON.stringify(r)
      expect(all).toContain('188')
      expect(all).toContain('112')
      expect(all).toContain('10111')
      const turn = understand(db(), s, NOW.date, NOW.minutes)
      expect(turn.kind, s).toBe('reply')
      if (turn.kind === 'reply') expect(turn.reply.text).toBe(crisisReply().text)
    }
    // Never split into clauses, even with "e" + an action.
    expect(clausesOf(db(), 'quero morrer e passa LinkedIn pra amanhã', NOW.date, NOW.minutes)).toHaveLength(1)
    expect(hasCrisisSignal('morri de rir com esse vídeo')).toBe(false)
  })

  it('"estou ansiosa" / "preciso me acalmar" → técnicas curtas + link', () => {
    for (const s of ['estou ansiosa', 'preciso me acalmar', 'tô muito ansiosa']) {
      const r = say(s)!
      expect(r?.area, s).toBe('cuidar de mim')
      expect(r.lines!.length).toBeGreaterThanOrEqual(2)
      expect(r.link!.to).toContain('/cuidar')
      expect(r.action).toBeUndefined()
    }
    expect(say('estou ansiosa pela viagem')?.area).not.toBe('cuidar de mim')
  })

  it('"faz o 5-4-3-2-1" → passos', () => {
    const r = say('faz o 5-4-3-2-1')!
    expect(r.lines).toHaveLength(5)
    expect(r.lines![0].text).toMatch(/5 coisas/)
  })

  it('"preciso de uma mensagem para …" → Modo Pausa já preenchido', () => {
    const r = say('preciso de uma mensagem para minha mãe pedindo tempo para pensar')!
    expect(r.link!.to).toBe('/cuidar?v=pausa&intencao=tempo&contexto=familia')
    expect(r.action).toBeUndefined()
    expect(r.text).toMatch(/não envio nada/)
  })

  it('"quais técnicas favoritei" → as favoritas', () => {
    const base = db()
    expect(say('quais técnicas favoritei?', base)!.text).toMatch(/ainda não favoritou/)
    const withFav = { ...base, careTechniquePrefs: [{ id: prefId('stop'), techniqueId: 'stop', favorite: true, usedAt: [], createdAt: '', updatedAt: '' }] }
    const r = say('quais técnicas favoritei?', withFav)!
    expect(r.lines!.map((l) => l.text)).toEqual(['STOP'])
  })

  it('o handler nunca escreve', () => {
    const base = db()
    useStore.setState({ db: base })
    for (const s of ['quero morrer', 'estou ansiosa', 'faz o 5-4-3-2-1', 'preciso de uma mensagem para meu chefe', 'quais técnicas favoritei']) {
      const r = say(s, base)!
      expect(r.action, s).toBeUndefined()
      expect(r.options?.some((o) => o.act) ?? false, s).toBe(false)
    }
    expect(getDB()).toBe(base)
  })
})
