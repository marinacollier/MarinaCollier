/**
 * Bíblia, Graça & Liberdade — the reading plans she gave (stable ids, so existing installs receive them once).
 *
 * - Plan 1 "Êxodo — Da opressão à presença": 40 sessions (one per chapter) in 8 blocks. Êxodo 1–5 she already
 *   studied before the app: they come in as done, WITHOUT a completion date (unknown, never invented).
 * - Plans 2–5 are planned (nothing done).
 * - `applySpiritualSeed` runs at every boot: it only CREATES what is missing (and was never deleted by her —
 *   `profile.removedSeedIds`). It never overwrites a plan, a session status, a study or a reflection.
 */
import type { DB, NewItem, SpiritualBlock, SpiritualPlan, SpiritualSession } from '../types'
import type { FeatureSeed } from './context'
import { nowISO } from '@/lib/id'

export const SPIRITUAL_PLAN_IDS = {
  exodo: 'seed:biblia:exodo',
  profetas: 'seed:biblia:profetas',
  graca: 'seed:biblia:graca',
  comunidade: 'seed:biblia:comunidade',
  oracao: 'seed:biblia:oracao',
} as const

export const sessionSeedId = (plan: keyof typeof SPIRITUAL_PLAN_IDS, slug: string | number) => `${SPIRITUAL_PLAN_IDS[plan]}:${slug}`

const EXODO_TITLES = [
  'Opressão no Egito e as parteiras que resistem',
  'O nascimento de Moisés',
  'A sarça ardente: Deus ouve o clamor',
  'Sinais, medo e o chamado de Moisés',
  'Tijolos sem palha',
  'A promessa renovada: “Eu sou o Senhor”',
  'Diante do faraó: as águas em sangue',
  'Rãs, piolhos e moscas',
  'Peste, úlceras e granizo',
  'Gafanhotos e trevas',
  'O anúncio da última praga',
  'A Páscoa',
  'Memória e a coluna de nuvem',
  'A travessia do mar',
  'O cântico de Moisés e de Miriã',
  'O maná no deserto',
  'Água da rocha',
  'Jetro e o cuidado partilhado',
  'No Sinai: um povo de sacerdotes',
  'As Dez Palavras',
  'Leis sobre servidão e violência',
  'O estrangeiro, a viúva e o órfão',
  'Justiça no tribunal e descanso da terra',
  'A aliança selada',
  'Ofertas e a arca',
  'O tabernáculo',
  'O altar e o átrio',
  'As vestes sacerdotais',
  'A consagração dos sacerdotes',
  'O altar do incenso',
  'Bezalel e o sábado',
  'O bezerro de ouro',
  'A presença que acompanha',
  'A aliança renovada',
  'Ofertas generosas',
  'A construção do tabernáculo',
  'A arca e os utensílios',
  'O altar, a bacia e o átrio',
  'As vestes prontas',
  'A glória enche o tabernáculo',
]

const EXODO_BLOCKS: SpiritualBlock[] = [
  { title: 'Opressão, chamado e resistência', from: 1, to: 5 },
  { title: 'A promessa e o confronto com o poder', from: 6, to: 10 },
  { title: 'Páscoa, libertação e travessia', from: 11, to: 15 },
  { title: 'Deserto, confiança e aliança', from: 16, to: 20 },
  { title: 'Justiça e organização da comunidade', from: 21, to: 24 },
  { title: 'Tabernáculo, sacerdócio e presença', from: 25, to: 31 },
  { title: 'Idolatria, crise e renovação', from: 32, to: 34 },
  { title: 'Construção e presença de Deus', from: 35, to: 40 },
]

const LUCAS_TITLES = [
  'Anúncios e o Magnificat',
  'O nascimento de Jesus',
  'João Batista e a genealogia',
  'Tentação e a missão em Nazaré',
  'Chamados e curas',
  'Bem-aventuranças e ais',
  'O centurião e a mulher perdoada',
  'As mulheres que seguiam Jesus',
  'O envio e a transfiguração',
  'O bom samaritano; Marta e Maria',
  'Ensina-nos a orar',
  'Não andeis ansiosos',
  'A mulher encurvada',
  'O banquete dos excluídos',
  'Ovelha, moeda e filho perdidos',
  'O rico e Lázaro',
  'Perdão, fé e os dez leprosos',
  'A viúva persistente; o fariseu e o publicano',
  'Zaqueu e a entrada em Jerusalém',
  'Autoridade e perguntas',
  'A oferta da viúva',
  'A ceia e o Getsêmani',
  'A cruz e o perdão',
  'Emaús e a ressurreição',
]

type PlanSpec = {
  key: keyof typeof SPIRITUAL_PLAN_IDS
  plan: Omit<SpiritualPlan, 'id' | 'createdAt' | 'updatedAt'>
  sessions: { slug: string; ref: string; chapter?: number; title: string; complementary?: boolean; done?: boolean }[]
}

const SPECS: PlanSpec[] = [
  {
    key: 'exodo',
    plan: {
      title: 'Êxodo — Da opressão à presença',
      description: 'Um Deus que ouve o clamor, confronta o poder e caminha com o povo no deserto.',
      bookOrTheme: 'Êxodo',
      sortOrder: 1,
      blocks: EXODO_BLOCKS,
    },
    sessions: EXODO_TITLES.map((title, i) => ({ slug: String(i + 1), ref: `Êxodo ${i + 1}`, chapter: i + 1, title, done: i < 5 })),
  },
  {
    key: 'profetas',
    plan: {
      title: 'Justiça e voz dos profetas',
      description: 'Os profetas e a fé que não separa culto de justiça.',
      bookOrTheme: 'Profetas',
      sortOrder: 2,
      note: 'Textos complementares: podem ser lidos na ordem que fizer sentido.',
    },
    sessions: [
      { slug: 'amos-5', ref: 'Amós 5', chapter: 5, title: 'Corra a justiça como as águas' },
      { slug: 'miqueias-6', ref: 'Miqueias 6', chapter: 6, title: 'Praticar a justiça, amar a misericórdia' },
      { slug: 'isaias-1', ref: 'Isaías 1', chapter: 1, title: 'Aprendei a fazer o bem' },
      { slug: 'isaias-58', ref: 'Isaías 58', chapter: 58, title: 'O jejum que liberta' },
      { slug: 'jeremias-22', ref: 'Jeremias 22', chapter: 22, title: 'Fazer justiça ao oprimido' },
    ],
  },
  {
    key: 'graca',
    plan: {
      title: 'Jesus e a graça radical',
      description: 'O Evangelho de Lucas, capítulo a capítulo, e o Sermão do Monte como complemento.',
      bookOrTheme: 'Lucas',
      sortOrder: 3,
      blocks: [
        { title: 'Evangelho de Lucas', from: 1, to: 24 },
        { title: 'Complementos — Sermão do Monte', from: 25, to: 27 },
      ],
    },
    sessions: [
      ...LUCAS_TITLES.map((title, i) => ({ slug: `lucas-${i + 1}`, ref: `Lucas ${i + 1}`, chapter: i + 1, title })),
      { slug: 'mateus-5', ref: 'Mateus 5', chapter: 5, title: 'Bem-aventuranças e o Sermão do Monte', complementary: true },
      { slug: 'mateus-6', ref: 'Mateus 6', chapter: 6, title: 'Oração e confiança', complementary: true },
      { slug: 'mateus-7', ref: 'Mateus 7', chapter: 7, title: 'A regra de ouro', complementary: true },
    ],
  },
  {
    key: 'comunidade',
    plan: {
      title: 'Amor, comunidade e inclusão',
      description: 'A comunidade que derruba muros: Atos, Gálatas, Tiago e 1 João.',
      bookOrTheme: 'Comunidade',
      sortOrder: 4,
    },
    sessions: [
      { slug: 'atos-2', ref: 'Atos 2', chapter: 2, title: 'Pentecostes e partilha' },
      { slug: 'atos-8', ref: 'Atos 8', chapter: 8, title: 'Filipe e o eunuco etíope' },
      { slug: 'atos-10', ref: 'Atos 10', chapter: 10, title: 'Pedro e Cornélio' },
      { slug: 'atos-15', ref: 'Atos 15', chapter: 15, title: 'O concílio de Jerusalém' },
      { slug: 'galatas-3', ref: 'Gálatas 3', chapter: 3, title: 'Nem judeu nem grego' },
      { slug: 'galatas-5', ref: 'Gálatas 5', chapter: 5, title: 'Liberdade para amar' },
      { slug: 'tiago-1', ref: 'Tiago 1', chapter: 1, title: 'A religião que cuida' },
      { slug: 'tiago-2', ref: 'Tiago 2', chapter: 2, title: 'Fé sem favoritismo' },
      { slug: '1-joao-4', ref: '1 João 4', chapter: 4, title: 'Deus é amor' },
    ],
  },
  {
    key: 'oracao',
    plan: {
      title: 'Oração e contemplação',
      description: 'Salmos para respirar, confiar e ser conhecida por Deus.',
      bookOrTheme: 'Salmos',
      sortOrder: 5,
    },
    sessions: [
      { slug: 'salmos-23', ref: 'Salmos 23', chapter: 23, title: 'O Senhor é meu pastor' },
      { slug: 'salmos-27', ref: 'Salmos 27', chapter: 27, title: 'Confiança no meio do medo' },
      { slug: 'salmos-42', ref: 'Salmos 42', chapter: 42, title: 'Sede de Deus' },
      { slug: 'salmos-46', ref: 'Salmos 46', chapter: 46, title: 'Aquietai-vos' },
      { slug: 'salmos-51', ref: 'Salmos 51', chapter: 51, title: 'Um coração novo' },
      { slug: 'salmos-91', ref: 'Salmos 91', chapter: 91, title: 'Abrigo' },
      { slug: 'salmos-139', ref: 'Salmos 139', chapter: 139, title: 'Tu me conheces' },
      { slug: 'eclesiastes-3', ref: 'Eclesiastes 3', chapter: 3, title: 'Tempo para tudo' },
    ],
  },
]

/** Plans and sessions as payloads (stable ids, no timestamps). */
export function spiritualSeedPayloads(): { plans: NewItem<'spiritualPlans'>[]; sessions: NewItem<'spiritualSessions'>[] } {
  const plans: NewItem<'spiritualPlans'>[] = []
  const sessions: NewItem<'spiritualSessions'>[] = []
  for (const spec of SPECS) {
    const planId = SPIRITUAL_PLAN_IDS[spec.key]
    plans.push({ ...spec.plan, id: planId })
    spec.sessions.forEach((s, i) => {
      const session: NewItem<'spiritualSessions'> = {
        id: sessionSeedId(spec.key, s.slug),
        planId,
        scriptureReference: s.ref,
        chapterNumber: s.chapter,
        title: s.title,
        sortOrder: i + 1,
        estimatedMinutes: 25,
        status: s.done ? 'concluido' : 'pendente',
      }
      if (s.done) session.importedDone = true
      if (s.complementary) session.complementary = true
      sessions.push(session)
    })
  }
  return { plans, sessions }
}

export const seedSpiritual: FeatureSeed = (ctx) => {
  const { plans, sessions } = spiritualSeedPayloads()
  return {
    spiritualPlans: plans.map((p) => ctx.make('spiritualPlans', p)),
    spiritualSessions: sessions.map((s) => ctx.make('spiritualSessions', s)),
  }
}

/**
 * Idempotent and additive: creates plans/sessions whose id is missing (and that she never deleted).
 * Returns the SAME db object when there is nothing to add (so boot doesn't rewrite storage).
 */
export function applySpiritualSeed(db: DB, now: string = nowISO()): DB {
  const { plans, sessions } = spiritualSeedPayloads()
  const removed = new Set(db.profile.removedSeedIds ?? [])
  const havePlans = new Set(db.spiritualPlans.map((p) => p.id))
  const haveSessions = new Set(db.spiritualSessions.map((s) => s.id))
  const addPlans = plans.filter((p) => !havePlans.has(p.id!) && !removed.has(p.id!))
  const addSessions = sessions.filter((s) => !haveSessions.has(s.id!) && !removed.has(s.id!) && !removed.has(s.planId))
  if (!addPlans.length && !addSessions.length) return db
  const stamp = <T extends { id?: string }>(x: T) => ({ ...x, id: x.id!, createdAt: now, updatedAt: now })
  return {
    ...db,
    spiritualPlans: [...db.spiritualPlans, ...addPlans.map((p) => stamp(p) as SpiritualPlan)],
    spiritualSessions: [...db.spiritualSessions, ...addSessions.map((s) => stamp(s) as SpiritualSession)],
  }
}
