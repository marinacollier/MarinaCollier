import { seedId, type FeatureSeed } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import type { NewItem, StudyTrack } from '@/data/types'

type TrackSeed = Pick<StudyTrack, 'id' | 'name' | 'emoji' | 'tone' | 'status'> & Partial<Pick<StudyTrack, 'formats' | 'notes'>>

/** Stable ids other seeds (Lumos memory) and tests point at. */
export const LEARNING_SEED_IDS = {
  bookCDH: seedId('learning', 'book-continuous-discovery-habits'),
  productTalk: seedId('learning', 'ref-product-talk'),
  lenny: seedId('learning', 'ref-lennys-newsletter'),
  pragmatic: seedId('learning', 'ref-the-pragmatic-engineer'),
} as const

/**
 * Learning OS — Marina's real trilhas (life brief §17 + simplificação radical).
 * No fixed classes: they work as tracks, each with what she wants from it.
 * The weekly English commitment lives in the calendar; its day/time was never given, so it is not
 * invented here (the connected calendar prevails).
 */
const TRACKS: TrackSeed[] = [
  {
    id: SEED_IDS.trackIngles,
    name: 'Inglês',
    emoji: '🇬🇧',
    tone: 'ocean',
    status: 'ativo',
    formats: ['Cambly', 'Estudo individual', 'Conversação', 'Vocabulário', 'Leitura', 'Listening'],
    notes: 'Objetivo: conversação, pronúncia, vocabulário prático, fluência e confiança.',
  },
  { id: SEED_IDS.trackPos, name: 'Pós-graduação', emoji: '🎓', tone: 'plum', status: 'ativo' },
  // reuses the old "AI / Produto / Liderança" id so an existing install doesn't grow a duplicate
  {
    id: SEED_IDS.trackProduto,
    name: 'Produto',
    emoji: '🧭',
    tone: 'accent',
    status: 'ativo',
    notes: 'Foco: IA aplicada a Produto e liderança.',
  },
  { id: seedId('learning', 'tera'), name: 'Tera', emoji: '✨', tone: 'sage', status: 'ativo' },
]

type ItemSeed = Omit<NewItem<'studyItems'>, 'progress' | 'order'>

/** What she studies now — only what she told us (Cambly is her English format). */
const STUDYING: ItemSeed[] = [
  { id: seedId('learning', 'ingles-cambly'), trackId: SEED_IDS.trackIngles, title: 'Cambly / conversação', kind: 'aula', status: 'estudando' },
]

/**
 * Reference content she follows: shown only when she asks ("me mostra algo que eu salvei"),
 * NEVER a task, never "atrasado", no due dates.
 */
const REFERENCES: ItemSeed[] = [
  {
    id: LEARNING_SEED_IDS.productTalk,
    trackId: SEED_IDS.trackProduto,
    title: 'Product Talk',
    kind: 'newsletter',
    source: 'Teresa Torres',
    link: 'https://www.producttalk.org',
    notes: 'Produto · discovery',
    status: 'backlog',
    reference: true,
  },
  {
    id: LEARNING_SEED_IDS.lenny,
    trackId: SEED_IDS.trackProduto,
    title: "Lenny's Newsletter",
    kind: 'newsletter',
    source: 'Lenny Rachitsky',
    link: 'https://www.lennysnewsletter.com',
    notes: 'Produto',
    status: 'backlog',
    reference: true,
  },
  {
    id: LEARNING_SEED_IDS.pragmatic,
    title: 'The Pragmatic Engineer',
    kind: 'newsletter',
    source: 'Gergely Orosz',
    link: 'https://newsletter.pragmaticengineer.com',
    notes: 'Engenharia · IA',
    status: 'backlog',
    reference: true,
  },
  // recent interests — themes to go deeper into when she wants
  { id: seedId('learning', 'tema-ai-assisted-engineering'), title: 'AI-assisted software engineering', kind: 'tema', notes: 'Engenharia · IA', status: 'backlog', reference: true },
  { id: seedId('learning', 'tema-claude'), title: 'Claude', kind: 'tema', notes: 'IA', status: 'backlog', reference: true },
  { id: seedId('learning', 'tema-ia-produto'), trackId: SEED_IDS.trackProduto, title: 'IA aplicada a Produto', kind: 'tema', notes: 'Produto · IA', status: 'backlog', reference: true },
]

export const seedLearning: FeatureSeed = (ctx) => ({
  studyTracks: TRACKS.map((t, i) => ctx.make('studyTracks', { ...t, order: i, archived: false })),
  studyItems: [...STUDYING, ...REFERENCES].map((it, i) => ctx.make('studyItems', { ...it, progress: 0, order: i })),
  books: [
    ctx.make('books', {
      id: LEARNING_SEED_IDS.bookCDH,
      title: 'Continuous Discovery Habits',
      author: 'Teresa Torres',
      category: 'Produto',
      status: 'lendo',
      // no invented percent or start date: where she is is the chapter she told us
      progress: 0,
      currentChapter: 'Chapter 10 — Testing Assumptions',
      quotes: [],
      order: 0,
    }),
  ],
})
