import type { FeatureSeed } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import type { StudyTrack } from '@/data/types'

const TRACKS: { id: string; name: string; emoji: string; tone: StudyTrack['tone'] }[] = [
  { id: SEED_IDS.trackIngles, name: 'Inglês', emoji: '🇬🇧', tone: 'ocean' },
  { id: SEED_IDS.trackPos, name: 'Pós-graduação', emoji: '🎓', tone: 'plum' },
  { id: SEED_IDS.trackProduto, name: 'Produto', emoji: '🧭', tone: 'accent' },
  { id: SEED_IDS.trackIA, name: 'Inteligência Artificial', emoji: '🤖', tone: 'sage' },
  { id: SEED_IDS.trackTecnologia, name: 'Tecnologia', emoji: '💻', tone: 'ink' },
  { id: SEED_IDS.trackLideranca, name: 'Liderança', emoji: '🌱', tone: 'sand' },
  { id: SEED_IDS.trackCursos, name: 'Cursos e certificações', emoji: '📜', tone: 'ocean' },
]

/** Study trilhas + a few honest starting points. No invented progress or reading history. */
export const seedLearning: FeatureSeed = (ctx) => ({
  studyTracks: TRACKS.map((t, i) => ctx.make('studyTracks', { ...t, order: i, archived: false })),
  studyItems: [
    ctx.make('studyItems', {
      trackId: SEED_IDS.trackIngles,
      title: 'Conversação semanal',
      kind: 'aula',
      status: 'estudando',
      progress: 0,
      nextContent: 'definir tema da próxima conversa',
      order: 0,
    }),
    ctx.make('studyItems', {
      trackId: SEED_IDS.trackPos,
      title: 'Disciplina atual da pós',
      kind: 'curso',
      status: 'estudando',
      progress: 0,
      nextContent: 'definir',
      order: 1,
    }),
    ctx.make('studyItems', {
      trackId: SEED_IDS.trackIA,
      title: 'Fundamentos de agentes de IA',
      kind: 'tema',
      status: 'proximo',
      progress: 0,
      order: 0,
    }),
    ctx.make('studyItems', {
      trackId: SEED_IDS.trackProduto,
      title: 'Discovery contínuo',
      kind: 'tema',
      status: 'backlog',
      progress: 0,
      order: 0,
    }),
    ctx.make('studyItems', {
      trackId: SEED_IDS.trackLideranca,
      title: 'Feedback e 1:1s',
      kind: 'tema',
      status: 'backlog',
      progress: 0,
      order: 1,
    }),
  ],
  books: [
    ctx.make('books', { title: 'Born to Run', author: 'Christopher McDougall', category: 'Corrida', status: 'proximo', progress: 0, quotes: [], order: 0 }),
    ctx.make('books', { title: 'Continuous Discovery Habits', author: 'Teresa Torres', category: 'Produto', status: 'quero', progress: 0, quotes: [], order: 0 }),
    ctx.make('books', { title: 'Inspired', author: 'Marty Cagan', category: 'Produto', status: 'quero', progress: 0, quotes: [], order: 1 }),
  ],
})
