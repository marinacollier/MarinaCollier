/**
 * Ateliê Literário — her existing work as RECORDS ONLY (docs/specs/ATELIE_LITERARIO.md, "Acervo inicial").
 *
 * - No full text exists in the app for any of these: every work is `textPending: true` and has NO versions.
 *   Known passages are kept as `excerpts`, never as the text. Nothing is reconstructed or composed.
 * - Statuses never claim approval: works with a version identified elsewhere carry a separate `provenance` flag
 *   ("verificar aprovação"), and her original words for the status stay in `statusNote`.
 * - "Geometria do Afeto" comes with its description and themes but NO works: she decides what belongs to it.
 * - `applyAtelieSeed` runs at every boot: it only CREATES what is missing (and never deleted by her —
 *   `profile.removedSeedIds`). It never overwrites a work, a collection or her author profile.
 */
import type { DB, LiteraryAuthorProfile, LiteraryCollection, LiteraryWork, NewItem } from '../types'
import type { FeatureSeed } from './context'
import { nowISO } from '@/lib/id'

export const ATELIE_IDS = {
  aCasa: 'seed:atelie:a-casa',
  espelho: 'seed:atelie:espelho',
  aCadeira: 'seed:atelie:a-cadeira',
  pressao: 'seed:atelie:pressao',
  registro: 'seed:atelie:registro',
  arquitetura: 'seed:atelie:arquitetura',
  semInstrucoes: 'seed:atelie:sem-instrucoes',
  aterramento: 'seed:atelie:aterramento',
  naoPertencimento: 'seed:atelie:nao-pertencimento',
  geometriaDoAfeto: 'seed:atelie:colecao:geometria-do-afeto',
  perfil: 'seed:atelie:perfil',
} as const

type WorkSeed = Omit<NewItem<'literaryWorks'>, 'collectionIds' | 'textPending' | 'source' | 'origin' | 'symbols' | 'excerpts'> &
  Partial<Pick<LiteraryWork, 'symbols' | 'excerpts'>>

const WORKS: WorkSeed[] = [
  {
    id: ATELIE_IDS.aCasa,
    title: 'A Casa',
    dateLabel: 'jul/2026 (dia a confirmar)',
    month: '2026-07',
    genre: 'Poesia contemporânea',
    status: 'lapidacao',
    statusNote: 'versão anterior identificada; confirmação pendente',
    provenance: 'versao_anterior',
    themes: ['intimidade', 'memória', 'pertencimento', 'vulnerabilidade'],
    symbols: ['cômodos'],
    centralImage: 'Cômodos que permanecem fechados até serem atravessados.',
    excerpts: ['A casa descobre que sobreviver nunca foi o mesmo que habitar todos os cômodos.'],
  },
  {
    id: ATELIE_IDS.espelho,
    title: 'Espelho',
    dateLabel: '26/07/2026',
    date: '2026-07-26',
    genre: 'Poesia',
    status: 'lapidacao',
    statusNote: 'versão final anterior identificada; verificar aprovação atual',
    provenance: 'versao_final_anterior',
    themes: ['memória', 'término', 'fragmentação'],
    symbols: ['espelhos'],
    centralImage: 'Espelhos que continuam refletindo depois da partida.',
  },
  {
    id: ATELIE_IDS.aCadeira,
    title: 'A Cadeira',
    dateLabel: '26/07/2026',
    date: '2026-07-26',
    genre: 'Poesia',
    status: 'lapidacao',
    statusNote: 'versão final anterior identificada; verificar aprovação atual',
    provenance: 'versao_final_anterior',
    themes: ['ausência paterna', 'abandono', 'espera', 'família'],
    symbols: ['cadeira vazia', 'cabeceira da mesa', 'fotografias', 'aniversários', 'missa de domingo'],
    excerpts: ['Era eu quem continuava guardando o lugar.', 'O vazio pertence a quem se levantou.'],
  },
  {
    id: ATELIE_IDS.pressao,
    title: 'Pressão',
    dateLabel: '02/08/2026',
    date: '2026-08-02',
    genre: 'Poesia',
    status: 'lapidacao',
    statusNote: 'versão final anterior identificada; verificar aprovação atual',
    provenance: 'versao_final_anterior',
    provenanceNote: 'Existem versões diferentes; não presumir que todos os trechos pertencem à mesma versão final.',
    themes: ['intimidade', 'ansiedade', 'corpo', 'desejo', 'compressão e alívio'],
    excerpts: ['Por fora parecia paz. Era apenas pressão bem distribuída.'],
  },
  {
    id: ATELIE_IDS.registro,
    title: 'Registro',
    dateLabel: 'data a confirmar',
    genre: 'Fragmento poético',
    status: 'ideia',
    statusNote: 'ideia',
    themes: ['término', 'ausência', 'burocracia', 'reconhecimento da perda'],
    concept: 'Nascimento e morte têm certidões; o fim de uma relação não tem registro equivalente.',
  },
  {
    id: ATELIE_IDS.arquitetura,
    title: 'Arquitetura',
    dateLabel: 'data a confirmar',
    genre: 'Poesia/prosa poética',
    status: 'rascunho',
    statusNote: 'em desenvolvimento',
    themes: ['crise', 'transformação', 'continuidade', 'reconstrução'],
    excerpts: ['Há acontecimentos que deixam de ser memória. Viram arquitetura.'],
    concept: 'A vida não precisa começar de novo a cada crise; sua construção incorpora os acontecimentos.',
  },
  {
    id: ATELIE_IDS.semInstrucoes,
    title: 'Sem instruções',
    dateLabel: 'out/2026 (data a confirmar)',
    month: '2026-10',
    genre: 'Prosa poética',
    status: 'lapidacao',
    statusNote: 'versão trabalhada e usada em leitura; confirmar texto final',
    provenance: 'versao_trabalhada',
    themes: ['cuidado', 'espontaneidade', 'sede', 'linguagem', 'delicadeza'],
    excerpts: ['Durante muito tempo, a sede precisou ser explicada.'],
    concept:
      'Receber cuidado exigia instruções; em outro contexto, antes de existir intimidade, uma delicadeza foi oferecida espontaneamente. Preservar a ambiguidade: um gesto não comprova amor, permanência ou compatibilidade.',
  },
  {
    id: ATELIE_IDS.aterramento,
    title: 'Aterramento',
    dateLabel: '25/10/2026',
    date: '2026-10-25',
    genre: 'Escrita autobiográfica / prosa poética',
    status: 'rascunho',
    statusNote: 'em desenvolvimento',
    themes: ['fé', 'movimento', 'liberdade', 'recomeços', 'pertencimento'],
    creationContext: 'Escrita durante a viagem à África do Sul.',
    concept: 'Tensão entre desejo de estabilidade e uma vida que continua se transformando.',
  },
  {
    id: ATELIE_IDS.naoPertencimento,
    title: 'Não pertencimento',
    provisionalTitle: true,
    dateLabel: '27/10/2026',
    date: '2026-10-27',
    genre: 'Prosa poética',
    status: 'rascunho',
    statusNote: 'em desenvolvimento',
    themes: ['solidão', 'amor', 'família', 'deslocamento', 'viagem', 'memória'],
    creationContext: 'Sentimentos contraditórios durante a viagem, lembranças de domingos compartilhados, relações familiares, estar longe.',
  },
]

const COLLECTIONS: NewItem<'literaryCollections'>[] = [
  {
    id: ATELIE_IDS.geometriaDoAfeto,
    name: 'Geometria do Afeto',
    description: 'Sede, água, recipientes, nascentes, capacidade de amar, cuidado espontâneo, necessidade x oferta.',
    themes: ['sede', 'água', 'recipientes', 'nascentes', 'capacidade de amar', 'cuidado espontâneo', 'necessidade x oferta'],
    workIds: [],
    source: 'seed',
  },
]

const PROFILE: NewItem<'literaryProfile'> = {
  id: ATELIE_IDS.perfil,
  identity: 'Escrita contemporânea, intimista e sensorial, com imagens materiais que sustentam experiências emocionais abstratas.',
  strengths: [
    'Metáforas extensas',
    'Coerência entre objeto e sentimento',
    'Ausência representada por presença material',
    'Tensões afetivas sem vilanizar',
    'Interesse em ambiguidade e contradição',
    'Objetos cotidianos como estrutura',
  ],
  developmentPoints: [
    'Não explicar a imagem depois de construí-la',
    'Encerramentos menos conclusivos',
    'Repertório além de casa, água e arquitetura',
    'Mais variedade sintática',
    'Evitar fragmentação artificial de versos',
    'Cenas e personagens',
    'Humor, ironia e cotidiano',
    'Textos menos dependentes de uma metáfora central',
    'Distinguir frases bonitas isoladas de estruturas consistentes',
  ],
  goal: 'Voz autoral reconhecível, repertório técnico, eventualmente uma coleção ou livro de poesia e prosa poética.',
  source: 'seed',
}

/** Works, collections and the author profile as payloads (stable ids, no timestamps). No versions — ever. */
export function atelieSeedPayloads(): {
  works: NewItem<'literaryWorks'>[]
  collections: NewItem<'literaryCollections'>[]
  profile: NewItem<'literaryProfile'>
} {
  const works = WORKS.map(
    (w): NewItem<'literaryWorks'> => ({
      ...w,
      symbols: w.symbols ?? [],
      excerpts: w.excerpts ?? [],
      collectionIds: [],
      textPending: true,
      origin: 'acervo',
      source: 'seed',
    }),
  )
  return { works, collections: COLLECTIONS.map((c) => ({ ...c, themes: [...c.themes], workIds: [] })), profile: { ...PROFILE } }
}

export const seedAtelie: FeatureSeed = (ctx) => {
  const { works, collections, profile } = atelieSeedPayloads()
  return {
    literaryWorks: works.map((w) => ctx.make('literaryWorks', w)),
    literaryCollections: collections.map((c) => ctx.make('literaryCollections', c)),
    literaryProfile: [ctx.make('literaryProfile', profile)],
  }
}

/**
 * Idempotent and additive: creates works / collection / profile whose id is missing (and that she never deleted).
 * Returns the SAME db object when there is nothing to add (so boot doesn't rewrite storage).
 */
export function applyAtelieSeed(db: DB, now: string = nowISO()): DB {
  const { works, collections, profile } = atelieSeedPayloads()
  const removed = new Set(db.profile.removedSeedIds ?? [])
  const have = (list: { id: string }[] | undefined) => new Set((list ?? []).map((x) => x.id))
  const haveWorks = have(db.literaryWorks)
  const haveCols = have(db.literaryCollections)
  const haveProfile = have(db.literaryProfile)
  const addWorks = works.filter((w) => !haveWorks.has(w.id!) && !removed.has(w.id!))
  const addCols = collections.filter((c) => !haveCols.has(c.id!) && !removed.has(c.id!))
  const addProfile = !haveProfile.has(profile.id!) && !removed.has(profile.id!) ? [profile] : []
  if (!addWorks.length && !addCols.length && !addProfile.length) return db
  const stamp = <T extends { id?: string }>(x: T) => ({ ...x, id: x.id!, createdAt: now, updatedAt: now })
  return {
    ...db,
    literaryWorks: [...(db.literaryWorks ?? []), ...addWorks.map((w) => stamp(w) as LiteraryWork)],
    literaryVersions: db.literaryVersions ?? [],
    literaryCollections: [...(db.literaryCollections ?? []), ...addCols.map((c) => stamp(c) as LiteraryCollection)],
    literaryProfile: [...(db.literaryProfile ?? []), ...addProfile.map((p) => stamp(p) as LiteraryAuthorProfile)],
  }
}
