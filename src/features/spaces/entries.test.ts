import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/app/routes'
import { activeTab, TABS } from '@/components/layout/nav'
import { emptyDB } from '@/data/defaults'
import { buildSeed } from '@/data/seed'
import type { DB } from '@/data/types'
import { searchSuggestions } from '@/features/search/suggestions'
import { lifeAreas, projectEntries, rituals, spaceGroups } from './entries'

const TODAY = '2026-10-02'
const seed = buildSeed(TODAY)
const keys = (db: DB) => spaceGroups(db, TODAY).flatMap((g) => g.entries.map((e) => e.key))

describe('navigation (MARINA OS 2.0)', () => {
  it('has exactly six places: Hoje · Agenda · Minha Vida · Estudos · Projetos · Finanças', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Hoje', 'Agenda', 'Minha Vida', 'Estudos', 'Projetos', 'Finanças'])
    expect(TABS.find((t) => t.label === 'Estudos')!.to).toBe(ROUTES.study)
  })

  it('each page keeps its hub lit; Lumos and Ajustes belong to Hoje', () => {
    expect(activeTab('/')).toBe(ROUTES.today)
    expect(activeTab('/lumos')).toBe(ROUTES.today)
    expect(activeTab('/ajustes/memoria')).toBe(ROUTES.today)
    expect(activeTab('/agenda')).toBe(ROUTES.agenda)
    expect(activeTab('/semana')).toBe(ROUTES.agenda)
    for (const p of ['/projetos', '/trabalho', '/trabalho/projeto/x', '/trabalho/creator/ugc', '/carreira/posts']) expect(activeTab(p)).toBe(ROUTES.projects)
    expect(activeTab('/dinheiro')).toBe(ROUTES.money)
    for (const p of ['/minha-vida', '/viagens/x', '/vida/luna', '/inbox', '/cuidar']) expect(activeTab(p)).toBe(ROUTES.spaces)
    for (const p of ['/estudos', '/estudos/aprendizagem', '/livros', '/livros/x', '/biblia', '/biblia/plano/x', '/atelie', '/atelie/obra/x']) expect(activeTab(p)).toBe(ROUTES.study)
  })
})

describe('Minha Vida and Projetos', () => {
  const areas = lifeAreas(seed, TODAY)
  const all = areas.flatMap((a) => a.entries.map((e) => e.key))

  it('groups her life into her areas; empty ones do not appear', () => {
    expect(areas.map((a) => a.label)).toEqual(['Corpo e movimento', 'Saúde e autocuidado', 'Mente e autoconhecimento', 'Estudos e desenvolvimento', 'Livros e biblioteca', 'Viagens e experiências', 'Casa, rotina e Luna', 'Objetivos de vida'].filter((l) => areas.some((a) => a.label === l)))
    expect(areas.find((a) => a.key === 'mente')!.entries[0].key).toBe('cuidar')
  })

  it('nothing reachable before is lost: every life entry of Espaços is in Minha Vida, every work entry in Projetos', () => {
    const before = spaceGroups(seed, TODAY)
    const lifeBefore = before.filter((g) => g.key !== 'trabalho').flatMap((g) => g.entries.map((e) => e.key)).filter((k) => k !== 'financas')
    for (const k of lifeBefore) expect(all).toContain(k)
    for (const r of rituals(seed)) expect(all).toContain(r.key)
    const work = before.find((g) => g.key === 'trabalho')!.entries.map((e) => e.key)
    expect(projectEntries(seed, TODAY).map((e) => e.key)).toEqual(work)
  })

  it('past trips stay reachable after the last one ends', () => {
    expect(lifeAreas(seed, '2027-06-01').flatMap((a) => a.entries.map((e) => e.key))).toContain('viagens')
  })
})

describe('Espaços', () => {
  it('groups her real life: Corpo · Trabalho · Aprender · Vida', () => {
    expect(spaceGroups(seed, TODAY).map((g) => g.label)).toEqual(['Corpo', 'Trabalho', 'Aprender', 'Vida'])
  })

  it('Trabalho has one entry per real project (from data), creator separate', () => {
    const work = spaceGroups(seed, TODAY).find((g) => g.key === 'trabalho')!
    const projects = seed.projects.filter((p) => p.status !== 'concluido' && p.kind !== 'creator')
    expect(work.entries.filter((e) => e.key.startsWith('project:')).map((e) => e.label)).toEqual(projects.sort((a, b) => a.order - b.order).map((p) => p.name))
    expect(work.entries.some((e) => e.key === 'creator')).toBe(true)
  })

  it('an empty database shows no empty modules at all', () => {
    expect(spaceGroups(emptyDB(), TODAY)).toEqual([])
  })

  it('Livros appears only with books, with a live hint', () => {
    const noBooks = { ...seed, books: [] }
    expect(keys(noBooks)).not.toContain('livros')
    const withBook: DB = {
      ...seed,
      books: [{ id: 'b', createdAt: '', updatedAt: '', title: 'Continuous Discovery Habits', status: 'lendo', progress: 40, quotes: [], order: 0 }],
    }
    const livros = spaceGroups(withBook, TODAY).flatMap((g) => g.entries).find((e) => e.key === 'livros')!
    expect(livros.hint).toBe('lendo: Continuous Discovery Habits')
  })

  it('Inbox appears only when it has something', () => {
    expect(keys({ ...seed, brainDump: [], notes: [] })).not.toContain('inbox')
    const one: DB = { ...seed, notes: [], brainDump: [{ id: 'x', createdAt: '', updatedAt: '', text: 'ideia solta', status: 'inbox' }] }
    expect(spaceGroups(one, TODAY).flatMap((g) => g.entries).find((e) => e.key === 'inbox')?.hint).toBe('1 pensamento pra organizar')
  })

  it('modules hidden in Design stay hidden', () => {
    const hidden: DB = { ...seed, profile: { ...seed.profile, modules: [...seed.profile.modules.filter((m) => m.id !== 'viagens'), { id: 'viagens', visible: false }] } }
    expect(keys(seed)).toContain('viagens')
    expect(keys(hidden)).not.toContain('viagens')
  })

  it('rituals stay reachable; Metas only with goals', () => {
    expect(rituals({ ...seed, goals: [] }).map((r) => r.to)).toEqual([ROUTES.weekPlanner, ROUTES.tasks, ROUTES.weeklyReview, ROUTES.monthlyReview, ROUTES.care])
  })

  it('search suggestions come from her data, not a fixed list', () => {
    const s = searchSuggestions(seed, TODAY)
    expect(s.length).toBeGreaterThan(0)
    expect(s.length).toBeLessThanOrEqual(6)
    expect(s).toContain(seed.projects.filter((p) => p.status === 'ativo').sort((a, b) => a.order - b.order)[0].name)
    expect(searchSuggestions(emptyDB(), TODAY).length).toBeLessThanOrEqual(1) // only a default favourite modality
  })
})
