/**
 * Aprendizagem through Lumos: her sentences, through the real conversation store. No AI calls.
 * One session per sentence/day, skills only when she names them, chosen subjects respected.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { getDB, useStore } from '@/data/store'
import { TRACK_EN } from '@/features/learning/engine/model'
import type { LumosReply } from './act/types'
import { ask, clearConversation, runOption, undoReply, useConversation, type Exchange } from './conversation'

const TODAY = '2026-11-09'
const at = (hm: string): Now => {
  const [h, m] = hm.split(':').map(Number)
  return { date: TODAY, minutes: h * 60 + m, iso: `${TODAY}T${hm}:00.000-03:00` }
}
const NOW = at('18:30')

function talk(text: string, now: Now = NOW): Exchange {
  const id = ask(text, now)!
  return useConversation.getState().exchanges.find((e) => e.id === id)!
}
const reply = (e: Exchange): LumosReply => {
  expect(e.lumos, e.question).toBeDefined()
  return e.lumos!.reply
}
const sessions = () => getDB().studySessions ?? []

beforeEach(() => {
  useStore.setState({ db: buildSeed(TODAY), hydrated: true })
  clearConversation()
})

describe('retro logging', () => {
  it('"hoje estudei 60 minutos de inglês preparando a reunião com Hillary" → ONE session, context kept, skills asked with chips', () => {
    const before = sessions().length
    const r = reply(talk('hoje estudei 60 minutos de inglês preparando a reunião com Hillary'))
    expect(r.area).toBe('estudos')
    expect(r.text).toMatch(/Registrei 60 min de inglês/)
    expect(r.sub).toMatch(/Quais habilidades/)
    const s = sessions()
    expect(s).toHaveLength(before + 1)
    const made = s[s.length - 1]
    expect(made).toMatchObject({ minutes: 60, domain: 'idiomas', trackId: TRACK_EN, date: TODAY, source: 'retroativo', context: 'preparando a reunião com Hillary' })
    expect(made.skills).toBeUndefined()
    // chip: she practised speaking
    const speaking = r.options!.find((o) => o.label === 'Speaking')!
    runOption(speaking)
    expect(sessions().find((x) => x.id === made.id)?.skills).toEqual(['speaking'])
  })

  it('is idempotent for the same sentence on the same day', () => {
    talk('hoje estudei 60 minutos de inglês preparando a reunião com Hillary')
    const n = sessions().length
    const r = reply(talk('hoje estudei 60 minutos de inglês preparando a reunião com Hillary'))
    expect(r.text).toMatch(/já está registrada/)
    expect(r.action).toBeUndefined()
    expect(sessions()).toHaveLength(n)
  })

  it('Desfazer removes the session', () => {
    const e = talk('Estudei IA por 45 minutos')
    expect(sessions().some((s) => s.domain === 'ia' && s.minutes === 45)).toBe(true)
    undoReply(e.id)
    expect(sessions().some((s) => s.domain === 'ia')).toBe(false)
  })

  it('"Li 20 páginas de teologia" asks how long, writes nothing; the answer records it', () => {
    const n = sessions().length
    const r = reply(talk('Li 20 páginas de teologia'))
    expect(r.text).toMatch(/Quanto tempo/)
    expect(sessions()).toHaveLength(n)
    reply(talk(r.options!.find((o) => o.label === '30 min')!.ask!))
    expect(sessions().find((s) => s.domain === 'cristianismo_teologia')).toMatchObject({ minutes: 30, pages: 20, learningMode: 'leitura' })
  })

  it('"Fiz 60 minutos de speaking para a reunião com Hillary" asks the language (never guessed)', () => {
    const r = reply(talk('Fiz 60 minutos de speaking para a reunião com Hillary'))
    expect(r.text).toMatch(/Em qual idioma/)
    reply(talk(r.options![0].ask!))
    const s = sessions().find((x) => x.skills?.includes('speaking'))!
    expect(s).toMatchObject({ minutes: 60, domain: 'idiomas', trackId: TRACK_EN, learningMode: 'speaking' })
  })
})

describe('recommendations', () => {
  it('"o que eu estudo agora" answers with reasons', () => {
    const r = reply(talk('o que eu estudo agora'))
    expect(r.text).toMatch(/Sugestão/)
    expect(r.lines?.length).toBeGreaterThan(0)
  })

  it('"tenho 20 minutos para estudar e estou cansada" → something short and light (or rest)', () => {
    const r = reply(talk('tenho 20 minutos para estudar e estou cansada'))
    expect(r.area).toBe('estudos')
    expect(`${r.text} ${r.lines?.map((l) => l.text).join(' ')}`).toMatch(/descansar|leve|Revisão/i)
  })

  it('"já fiz inglês hoje, faço espanhol?" after 60 min of English → short Spanish, no more long English', () => {
    talk('hoje estudei 60 minutos de inglês')
    const r = reply(talk('já fiz inglês hoje, faço espanhol?'))
    expect(r.sub).toMatch(/60 min de inglês/)
    expect(r.text).toMatch(/espanhol/i)
  })

  it('"hoje quero aprender algo de geopolítica" is not redirected to languages', () => {
    const r = reply(talk('hoje quero aprender algo de geopolítica'))
    expect(r.text).not.toMatch(/ingl|espanh/i)
    expect(r.lines?.every((l) => !/ingl|espanh/i.test(l.text))).toBe(true)
  })

  it('"tenho uma hora no Cambly" → Cambly with a purpose', () => {
    const r = reply(talk('tenho uma hora no Cambly'))
    expect(r.text).toMatch(/Cambly com objetivo/)
  })

  it('"Não quero estudar agora, quero descansar" → rest, no judgement', () => {
    const r = reply(talk('Não quero estudar agora, quero descansar'))
    expect(r.text).toMatch(/descansar/)
    expect(r.action).toBeUndefined()
  })
})

describe('errors and library', () => {
  it('"qual meu erro mais recorrente?" without cards says so honestly', () => {
    const r = reply(talk('qual meu erro mais recorrente?'))
    expect(r.text).toMatch(/Ainda não tenho erros/)
  })

  it('"Guarda esse podcast na minha biblioteca" without a name asks; with one, saves as "quero conhecer"', () => {
    const n = getDB().studyItems.length
    const r = reply(talk('Guarda esse podcast na minha biblioteca'))
    expect(r.text).toMatch(/nome ou o link/)
    expect(getDB().studyItems).toHaveLength(n)
    reply(talk('Guarda esse podcast na minha biblioteca: Hard Fork'))
    expect(getDB().studyItems.find((i) => i.title === 'Hard Fork')).toMatchObject({ libraryStatus: 'quero_conhecer', resourceType: 'podcast' })
  })
})
