import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { applyAtelieSeed, ATELIE_IDS } from '@/data/seed/atelie'
import { emptyDB, migrate } from '@/data/defaults'
import { syncCollections } from '@/data/sync/engine'
import { PRIVATE_COLLECTIONS } from '@/data/private-collections'
import { makeBackup, parseBackupText } from '@/features/settings/backup'
import { restoreBackup } from '@/features/settings/backup-io'
import { spaceGroups } from '@/features/spaces/entries'
import { lockSession } from '@/app/lock-store'
import type { DB } from '@/data/types'
import { diffLines, diffStats, diffWords } from './diff'
import { evolution, filterWorks, latestVersion, versionsOf, writingMap, developmentSuggestion } from './model'
import { approveVersion, checkpoint, createWork, restoreVersion, saveDraft, saveVersion, setInCollection, toggleFavorite } from './ops'
import { toMarkdown, toTxt } from './export'

const TODAY = '2026-10-27'
const LITERARY = ['literaryWorks', 'literaryVersions', 'literaryCollections', 'literaryProfile']

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed(TODAY))
})

describe('Ateliê seed — records only, nothing invented', () => {
  it('brings exactly the 9 works of the spec, each with text pending and NO versions', () => {
    const db = getDB()
    expect(db.literaryWorks.map((w) => w.title)).toEqual(['A Casa', 'Espelho', 'A Cadeira', 'Pressão', 'Registro', 'Arquitetura', 'Sem instruções', 'Aterramento', 'Não pertencimento'])
    expect(db.literaryVersions).toEqual([])
    for (const w of db.literaryWorks) {
      expect(w.textPending).toBe(true)
      expect(w.approvedVersionId).toBeUndefined()
      expect(w.favoriteVersionId).toBeUndefined()
      expect(w.status).not.toBe('final_aprovada')
      expect(w.status).not.toBe('publicado')
      expect('body' in w).toBe(false)
    }
  })

  it('keeps the known passages only as excerpts, word for word', () => {
    const byId = new Map(getDB().literaryWorks.map((w) => [w.id, w]))
    expect(byId.get(ATELIE_IDS.aCasa)!.excerpts).toEqual(['A casa descobre que sobreviver nunca foi o mesmo que habitar todos os cômodos.'])
    expect(byId.get(ATELIE_IDS.aCadeira)!.excerpts).toEqual(['Era eu quem continuava guardando o lugar.', 'O vazio pertence a quem se levantou.'])
    expect(byId.get(ATELIE_IDS.pressao)!.excerpts).toEqual(['Por fora parecia paz. Era apenas pressão bem distribuída.'])
    expect(byId.get(ATELIE_IDS.arquitetura)!.excerpts).toEqual(['Há acontecimentos que deixam de ser memória. Viram arquitetura.'])
    expect(byId.get(ATELIE_IDS.semInstrucoes)!.excerpts).toEqual(['Durante muito tempo, a sede precisou ser explicada.'])
    for (const id of [ATELIE_IDS.espelho, ATELIE_IDS.registro, ATELIE_IDS.aterramento, ATELIE_IDS.naoPertencimento]) expect(byId.get(id)!.excerpts).toEqual([])
  })

  it('a version identified elsewhere is a separate flag, never "aprovada"', () => {
    const byId = new Map(getDB().literaryWorks.map((w) => [w.id, w]))
    expect(byId.get(ATELIE_IDS.aCasa)!.provenance).toBe('versao_anterior')
    for (const id of [ATELIE_IDS.espelho, ATELIE_IDS.aCadeira, ATELIE_IDS.pressao]) expect(byId.get(id)!.provenance).toBe('versao_final_anterior')
    expect(byId.get(ATELIE_IDS.registro)!.status).toBe('ideia')
    expect(byId.get(ATELIE_IDS.naoPertencimento)!.provisionalTitle).toBe(true)
    expect(byId.get(ATELIE_IDS.espelho)!.date).toBe('2026-07-26')
    expect(byId.get(ATELIE_IDS.aCasa)!.date).toBeUndefined()
    expect(byId.get(ATELIE_IDS.aCasa)!.month).toBe('2026-07')
    expect(byId.get(ATELIE_IDS.registro)!.dateLabel).toBe('data a confirmar')
  })

  it('"Geometria do Afeto" comes with its themes and no works; the author profile is editable data', () => {
    const db = getDB()
    expect(db.literaryCollections).toHaveLength(1)
    const c = db.literaryCollections[0]
    expect(c.name).toBe('Geometria do Afeto')
    expect(c.workIds).toEqual([])
    expect(c.themes).toContain('necessidade x oferta')
    expect(db.literaryWorks.every((w) => w.collectionIds.length === 0)).toBe(true)
    expect(db.literaryProfile).toHaveLength(1)
    expect(db.literaryProfile[0].developmentPoints).toContain('Não explicar a imagem depois de construí-la')
  })

  it('apply is idempotent and returns the same object when nothing is missing', () => {
    const db = getDB()
    expect(applyAtelieSeed(db)).toBe(db)
  })

  it('an existing install (before the Ateliê) receives it once, additively', () => {
    const old = migrate({ ...emptyDB(), tasks: [{ id: 't1', title: 'x', status: 'todo', order: 0, createdAt: 'a', updatedAt: 'a' }] } as unknown as DB)
    const once = applyAtelieSeed(old)
    expect(once.literaryWorks).toHaveLength(9)
    expect(once.tasks).toHaveLength(1)
    const twice = applyAtelieSeed(once)
    expect(twice).toBe(once)
  })

  it('never overwrites what she edited and never brings back what she deleted', () => {
    actions.update('literaryWorks', ATELIE_IDS.espelho, { title: 'Espelhos', status: 'rascunho' })
    actions.remove('literaryWorks', ATELIE_IDS.registro)
    actions.update('literaryCollections', ATELIE_IDS.geometriaDoAfeto, { name: 'Geometria' })
    const next = applyAtelieSeed(getDB())
    expect(next.literaryWorks.find((w) => w.id === ATELIE_IDS.espelho)!.title).toBe('Espelhos')
    expect(next.literaryWorks.some((w) => w.id === ATELIE_IDS.registro)).toBe(false)
    expect(next.literaryCollections[0].name).toBe('Geometria')
    expect(getDB().profile.removedSeedIds).toContain(ATELIE_IDS.registro)
  })
})

describe('versions — nothing is ever overwritten', () => {
  it('autosave keeps one working draft, then a checkpoint keeps it and the next edit starts a new version', () => {
    const w = createWork({ title: 'Teste' })
    const v1 = saveDraft(w.id, 'primeira linha')!
    const v1b = saveDraft(w.id, 'primeira linha e mais')!
    expect(v1b.id).toBe(v1.id)
    expect(versionsOf(getDB(), w.id)).toHaveLength(1)
    checkpoint(w.id)
    const v2 = saveDraft(w.id, 'primeira linha e mais, de novo')!
    expect(v2.id).not.toBe(v1.id)
    expect(versionsOf(getDB(), w.id).map((v) => v.body)).toEqual(['primeira linha e mais', 'primeira linha e mais, de novo'])
    expect(v2.wordCount).toBe(6)
  })

  it('writing in a seeded work turns "texto pendente" off (it is now a fact) without changing its status', () => {
    saveDraft(ATELIE_IDS.aCasa, 'texto que ela colou')
    const w = getDB().literaryWorks.find((x) => x.id === ATELIE_IDS.aCasa)!
    expect(w.textPending).toBe(false)
    expect(w.status).toBe('lapidacao')
  })

  it('autosave never touches an approved version: approving freezes it, editing starts a new draft', () => {
    const w = createWork({ title: 'Aprovável' })
    saveDraft(w.id, 'versão boa')
    const v = latestVersion(getDB(), w.id)!
    expect(v.draft).toBe(true)
    approveVersion(v.id)
    const approved = getDB().literaryVersions.find((x) => x.id === v.id)!
    expect(approved.approvedAt).toBeTruthy()
    expect(approved.draft).toBe(false)
    const work = getDB().literaryWorks.find((x) => x.id === w.id)!
    expect(work.status).toBe('final_aprovada')
    expect(work.approvedVersionId).toBe(v.id)

    saveDraft(w.id, 'versão boa, mexida')
    saveDraft(w.id, 'versão boa, mexida de novo')
    expect(getDB().literaryVersions.find((x) => x.id === v.id)!.body).toBe('versão boa')
    expect(versionsOf(getDB(), w.id)).toHaveLength(2)
    expect(getDB().literaryWorks.find((x) => x.id === w.id)!.approvedVersionId).toBe(v.id)
  })

  it('restore creates a new version from the old one; the old one stays as it was', () => {
    const w = createWork({ title: 'Restaurar' })
    saveVersion(w.id, 'um')
    saveVersion(w.id, 'dois')
    const [first] = versionsOf(getDB(), w.id)
    const restored = restoreVersion(first.id)!
    const all = versionsOf(getDB(), w.id)
    expect(all.map((v) => v.body)).toEqual(['um', 'dois', 'um'])
    expect(restored.restoredFromId).toBe(first.id)
    expect(all[0]).toEqual(first)
  })

  it('"Salvar versão" with the same text does not duplicate', () => {
    const w = createWork({ title: 'Igual' })
    saveVersion(w.id, 'mesmo texto')
    saveVersion(w.id, 'mesmo texto')
    expect(versionsOf(getDB(), w.id)).toHaveLength(1)
  })

  it('one favorite per work', () => {
    const w = createWork({ title: 'Fav' })
    saveVersion(w.id, 'a')
    saveVersion(w.id, 'b')
    const [a, b] = versionsOf(getDB(), w.id)
    toggleFavorite(a.id)
    toggleFavorite(b.id)
    const [a2, b2] = versionsOf(getDB(), w.id)
    expect(a2.favorite).toBe(false)
    expect(b2.favorite).toBe(true)
    expect(getDB().literaryWorks.find((x) => x.id === w.id)!.favoriteVersionId).toBe(b.id)
  })
})

describe('diff', () => {
  it('marks added and removed words, keeping line breaks', () => {
    const parts = diffWords('a casa fechada\nsem porta', 'a casa aberta\nsem porta')
    expect(parts.filter((p) => p.op === 'del').map((p) => p.text.trim())).toEqual(['fechada'])
    expect(parts.filter((p) => p.op === 'add').map((p) => p.text.trim())).toEqual(['aberta'])
    expect(parts.map((p) => (p.op === 'del' ? '' : p.text)).join('')).toBe('a casa aberta\nsem porta')
    expect(parts.map((p) => (p.op === 'add' ? '' : p.text)).join('')).toBe('a casa fechada\nsem porta')
    expect(diffStats(parts)).toEqual({ added: 1, removed: 1 })
  })

  it('identical texts are all "same"; line diff works too', () => {
    expect(diffWords('igual', 'igual').every((p) => p.op === 'same')).toBe(true)
    const lines = diffLines('um\ndois\ntrês', 'um\ntrês\nquatro')
    expect(lines.filter((p) => p.op === 'del').map((p) => p.text)).toEqual(['dois\n'])
    expect(lines.filter((p) => p.op === 'add').map((p) => p.text)).toEqual(['quatro\n'])
  })
})

describe('library search and filters', () => {
  it('finds by title, theme, excerpt (accents ignored) and by the text of the latest version', () => {
    const titles = (q: string) => filterWorks(getDB(), { query: q }).map((w) => w.title)
    expect(titles('espelho')).toEqual(['Espelho'])
    expect(titles('ausencia paterna')).toEqual(['A Cadeira'])
    expect(titles('pressao bem distribuida')).toEqual(['Pressão'])
    const w = createWork({ title: 'Sem nome' })
    saveDraft(w.id, 'o farol apagado na ilha')
    expect(titles('farol')).toEqual(['Sem nome'])
  })

  it('filters by status, genre, theme and collection; archived hidden unless asked', () => {
    const db = getDB()
    expect(filterWorks(db, { status: 'ideia' }).map((w) => w.title)).toEqual(['Registro'])
    expect(filterWorks(db, { genre: 'Prosa poética' }).map((w) => w.title).sort()).toEqual(['Não pertencimento', 'Sem instruções'])
    expect(filterWorks(db, { theme: 'memória' })).toHaveLength(3)
    setInCollection(ATELIE_IDS.geometriaDoAfeto, ATELIE_IDS.semInstrucoes, true)
    expect(filterWorks(getDB(), { collectionId: ATELIE_IDS.geometriaDoAfeto }).map((w) => w.title)).toEqual(['Sem instruções'])
    actions.update('literaryWorks', ATELIE_IDS.registro, { status: 'arquivado' })
    expect(filterWorks(getDB()).some((w) => w.id === ATELIE_IDS.registro)).toBe(false)
    expect(filterWorks(getDB(), { status: 'arquivado' })).toHaveLength(1)
  })

  it('sorts by writing date (partial dates use the month), newest first', () => {
    const order = filterWorks(getDB(), {}, 'data').map((w) => w.title)
    expect(order.slice(0, 3)).toEqual(['Não pertencimento', 'Aterramento', 'Sem instruções'])
    expect(order.slice(-2).sort()).toEqual(['Arquitetura', 'Registro'])
  })
})

describe('evolution and map — objective, from her data', () => {
  it('counts statuses, themes and revisions; flags symbols/themes in ≥3 works', () => {
    const e = evolution(getDB(), TODAY)
    expect(e.total).toBe(9)
    expect(e.versionsTotal).toBe(0)
    expect(e.themes.find((t) => t.tag === 'memória')?.count).toBe(3)
    expect(e.perWeek).toHaveLength(8)
    const map = writingMap(getDB())
    expect(map.find((n) => n.tag === 'memória')?.veryPresent).toBe(true)
    expect(map.find((n) => n.tag === 'pertencimento')?.veryPresent).toBe(false)
  })

  it('time to approval comes from the real versions', () => {
    const w = createWork({ title: 'Tempo' })
    saveVersion(w.id, 'x')
    approveVersion(latestVersion(getDB(), w.id)!.id)
    expect(evolution(getDB(), TODAY).toApproval).toEqual([{ workId: w.id, title: 'Tempo', days: 0 }])
  })

  it('the development suggestion comes from her profile and can be dismissed', () => {
    const tip = developmentSuggestion(getDB(), TODAY)!
    expect(getDB().literaryProfile[0].developmentPoints).toContain(tip)
    actions.update('literaryProfile', ATELIE_IDS.perfil, { dismissedTips: getDB().literaryProfile[0].developmentPoints })
    expect(developmentSuggestion(getDB(), TODAY)).toBeUndefined()
  })
})

describe('export', () => {
  it('TXT and Markdown keep the line breaks of a poem', () => {
    expect(toTxt({ title: 'T' }, 'linha um\nlinha dois  \n')).toBe('T\n\nlinha um\nlinha dois\n')
    const md = toMarkdown({ title: 'T', subtitle: 's' }, 'linha um\nlinha dois\n\n# não é título')
    expect(md).toContain('# T')
    expect(md).toContain('linha um  \nlinha dois\n\n\\# não é título')
  })
})

describe('privacy', () => {
  it('literary collections never go to the cloud sync', () => {
    const keys = syncCollections(getDB())
    expect(keys).toContain('tasks')
    for (const k of LITERARY) {
      expect(PRIVATE_COLLECTIONS.has(k)).toBe(true)
      expect(keys).not.toContain(k)
    }
  })

  it('but they DO go into her backup and come back intact', async () => {
    const w = createWork({ title: 'Do backup' })
    saveVersion(w.id, 'um texto meu\ncom duas linhas', 'primeira')
    approveVersion(latestVersion(getDB(), w.id)!.id)
    await flushNow()
    const before = structuredClone(getDB())
    const text = JSON.stringify(makeBackup(getDB()))
    actions.replaceDB(emptyDB())
    const preview = parseBackupText(text)
    if (!preview.ok) throw new Error(preview.error)
    expect(preview.counts.find((c) => c.key === 'literaryVersions')?.count).toBe(1)
    await restoreBackup(preview)
    for (const k of LITERARY) expect(getDB()[k as keyof DB]).toEqual(before[k as keyof DB])
  })

  it('Espaços shows the Ateliê with a count only, and nothing when it is locked', () => {
    const entry = () => spaceGroups(getDB(), TODAY).flatMap((g) => g.entries).find((e) => e.key === 'atelie')
    expect(entry()?.hint).toBe('5 escritas em lapidação')
    actions.setProfile({ privacyLock: { enabled: true, areas: ['atelie'], pinHash: 'h', pinSalt: 's', relockMinutes: 5 } })
    lockSession()
    expect(entry()).toBeTruthy()
    expect(entry()?.hint).toBeUndefined()
  })
})
