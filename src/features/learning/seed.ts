import { seedId, type FeatureSeed } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import type { StudyTrack } from '@/data/types'

type TrackSeed = Pick<StudyTrack, 'id' | 'name' | 'emoji' | 'tone' | 'status'> & Partial<Pick<StudyTrack, 'formats' | 'notes'>>

/**
 * Learning OS — Marina's real trilhas (brief §17). No fixed classes: they work as tracks.
 * The weekly English commitment lives in the calendar; its time is never invented here.
 */
const TRACKS: TrackSeed[] = [
  {
    id: SEED_IDS.trackIngles,
    name: 'Inglês',
    emoji: '🇬🇧',
    tone: 'ocean',
    status: 'ativo',
    formats: ['Cambly', 'Estudo individual', 'Conversação', 'Vocabulário', 'Leitura', 'Listening'],
    notes: 'Tem um compromisso recorrente de inglês na semana — o calendário conectado prevalece sobre o seed.',
  },
  { id: SEED_IDS.trackPos, name: 'Pós-graduação', emoji: '🎓', tone: 'plum', status: 'ativo' },
  { id: seedId('learning', 'tera'), name: 'Tera', emoji: '✨', tone: 'sage', status: 'ativo' },
  // one continuous track; reuses the old "Produto" id so an existing install doesn't grow a duplicate
  { id: SEED_IDS.trackProduto, name: 'AI / Produto / Liderança', emoji: '🧭', tone: 'accent', status: 'continuo' },
]

/** Trilhas + honest placeholders. No invented courses, books, progress or reading history. */
export const seedLearning: FeatureSeed = (ctx) => ({
  studyTracks: TRACKS.map((t, i) => ctx.make('studyTracks', { ...t, order: i, archived: false })),
  studyItems: [
    ctx.make('studyItems', {
      id: seedId('learning', 'ingles-cambly'),
      trackId: SEED_IDS.trackIngles,
      title: 'Cambly / conversação',
      kind: 'aula',
      status: 'estudando',
      progress: 0,
      order: 0,
    }),
    ctx.make('studyItems', {
      id: seedId('learning', 'pos-disciplina-atual'),
      trackId: SEED_IDS.trackPos,
      title: 'Pós-graduação — disciplina atual',
      kind: 'curso',
      status: 'estudando',
      progress: 0,
      nextContent: 'definir próximo conteúdo',
      order: 1,
    }),
    ctx.make('studyItems', {
      id: seedId('learning', 'tera-trilha-atual'),
      trackId: seedId('learning', 'tera'),
      title: 'Tera — trilha atual',
      kind: 'curso',
      status: 'estudando',
      progress: 0,
      order: 2,
    }),
    ctx.make('studyItems', {
      id: seedId('learning', 'temas-ia'),
      trackId: SEED_IDS.trackProduto,
      title: 'Temas de IA para aprofundar',
      kind: 'tema',
      status: 'backlog',
      progress: 0,
      order: 0,
    }),
    ctx.make('studyItems', {
      id: seedId('learning', 'lideranca-desenvolver'),
      trackId: SEED_IDS.trackProduto,
      title: 'Liderança — o que quero desenvolver',
      kind: 'tema',
      status: 'backlog',
      progress: 0,
      order: 1,
    }),
  ],
  // the library starts empty: books enter only when Marina adds them
  books: [],
})
