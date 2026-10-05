/**
 * Lumos memory — what Lumos knows about Marina on day one, as seed DATA.
 * Only what her brief and specs say (reference 02/10/2026). Everything is editable / removable in
 * "O que Lumos sabe sobre mim"; a stable `key` lets Lumos update a line instead of duplicating it
 * ("não faço mais yoga na terça" → key 'yoga.weekday').
 *
 * Kinds: FACT (permanent) · PREFERENCE (how she likes things) · STATE (true now, will change).
 * HISTORY starts empty on purpose: no finished books, past trips or closed projects were given.
 */
import type { MemoryArea, MemoryItem, MemoryKind } from '../types'
import { seedId, type FeatureSeed } from './context'
import { SEED_IDS } from './ids'
import { LEARNING_SEED_IDS } from '@/features/learning/seed'

type MemorySeed = { key: string; kind: MemoryKind; area: MemoryArea; text: string; ref?: MemoryItem['ref'] }

export const MEMORY_SEED: MemorySeed[] = [
  // ── FACTS ────────────────────────────────────────────────────────────────
  { key: 'home.city', kind: 'fact', area: 'casa', text: 'Mora em São Paulo.' },
  { key: 'luna.breed', kind: 'fact', area: 'luna', text: 'Luna é a Border Collie da Marina 🐾.', ref: { type: 'pet', id: SEED_IDS.petLuna } },
  { key: 'work.field', kind: 'fact', area: 'trabalho', text: 'Trabalha com Produto, Tecnologia e IA, com vários projetos ao mesmo tempo.' },
  { key: 'work.presencial', kind: 'fact', area: 'trabalho', text: 'Terça e quarta são presenciais em Interlagos (SP); segunda, quinta e sexta, remoto.' },
  { key: 'work.hours', kind: 'fact', area: 'trabalho', text: 'Trabalho base das 09:00 às 18:00 — base, não bloco absoluto.' },
  { key: 'rhythm.wake', kind: 'fact', area: 'rotina', text: 'Acorda cedo: base 04:40, meta de dormir por volta das 22:00.' },
  { key: 'sports.modalities', kind: 'fact', area: 'esportes', text: 'Corre, faz trail, bike/gravel, natação, musculação, yoga, circo/aéreos, surf e mobilidade.' },
  {
    key: 'sports.totalpass',
    kind: 'fact',
    area: 'esportes',
    text: 'TotalPass: um check-in por dia em alguns lugares — natação e yoga no mesmo dia podem competir.',
  },
  { key: 'food.plan.source', kind: 'fact', area: 'alimentacao', text: 'Plano alimentar prescrito pelo nutricionista João Monteiro (Clínica JMN), em 02/10/2026.' },
  { key: 'work.yogaapp.limit', kind: 'fact', area: 'trabalho', text: 'Yoga App: no máximo ~1h por dia — nunca 3h numa tarde.', ref: { type: 'project', id: SEED_IDS.projYoga } },

  // ── PREFERENCES ──────────────────────────────────────────────────────────
  { key: 'training.heavy.morning', kind: 'preference', area: 'esportes', text: 'Prefere treinos pesados de manhã (06:00); sessões leves ficam pro fim do dia.' },
  { key: 'app.no.guilt', kind: 'preference', area: 'uso_app', text: 'Não quer app culpabilizador: nada de streak, “atrasado” ou cobrança.' },
  { key: 'food.no.compensation', kind: 'preference', area: 'alimentacao', text: 'Não quer dieta baseada em compensação, nem contagem de calorias.' },
  { key: 'app.talk.first', kind: 'preference', area: 'uso_app', text: 'Prefere contar pra Lumos e deixar ela organizar; formulário só quando precisar.' },
  { key: 'app.show.less', kind: 'preference', area: 'uso_app', text: 'Mostrar pouco: o que importa agora. Seção vazia não aparece.' },
  {
    key: 'presencial.rules',
    kind: 'preference',
    area: 'rotina',
    text: 'Em dia presencial: nada de pedal longo ou logística pesada de manhã; preparar as coisas na noite anterior.',
  },
  { key: 'morning.short', kind: 'preference', area: 'rotina', text: 'Manhã corrida vai de Milagre da manhã versão Essential — não quebra a rotina.' },
  { key: 'circo.saturday', kind: 'preference', area: 'esportes', text: 'Circo/aéreos de preferência no sábado — diversão, não obrigação.' },
  { key: 'weekend.light', kind: 'preference', area: 'rotina', text: 'Sexta à noite e fim de semana mais leves: trabalho urgente aparece, mas não domina.' },
  {
    key: 'study.references',
    kind: 'preference',
    area: 'estudos',
    text: 'Newsletters e conteúdos que acompanha são referência, nunca tarefa.',
  },

  // ── CURRENT STATE ────────────────────────────────────────────────────────
  {
    key: 'book.current',
    kind: 'state',
    area: 'leitura',
    text: 'Lendo Continuous Discovery Habits (Teresa Torres) — Chapter 10, Testing Assumptions.',
    ref: { type: 'book', id: LEARNING_SEED_IDS.bookCDH },
  },
  {
    key: 'trip.next',
    kind: 'state',
    area: 'viagens',
    text: 'Próxima grande viagem: África do Sul, 22/10 → 16/11/2026, base em Cape Town, maior parte solo.',
    ref: { type: 'trip', id: SEED_IDS.tripAfrica },
  },
  { key: 'trip.recife', kind: 'state', area: 'viagens', text: 'Recife: viagem própria, data ainda a confirmar.', ref: { type: 'trip', id: SEED_IDS.tripRecife } },
  { key: 'trip.itacare', kind: 'state', area: 'viagens', text: 'Réveillon em Itacaré — datas a confirmar.', ref: { type: 'trip', id: SEED_IDS.tripItacare } },
  {
    key: 'projects.active',
    kind: 'state',
    area: 'trabalho',
    text: 'Projetos ativos: Santander (principal, Produto/IA), FashionFinder (CTPO, referência 20/11), Day One AI, Yoga App e Creator/UGC.',
  },
  {
    key: 'training.week',
    kind: 'state',
    area: 'esportes',
    text: 'Semana base: natação seg e qui, upper ter, pernas qua (key), corrida longa sex, pedal longo dom; sábado livre.',
  },
  { key: 'yoga.weekday', kind: 'state', area: 'esportes', text: 'Yoga 1x/semana — hoje mora na terça, 19:00.' },
  { key: 'ceramica.days', kind: 'state', area: 'rotina', text: 'Cerâmica segunda e quinta à noite.' },
  {
    key: 'study.tracks',
    kind: 'state',
    area: 'estudos',
    text: 'Estudando: Inglês (Cambly — conversação, pronúncia, vocabulário prático, fluência e confiança), Pós-graduação e Produto.',
  },
  {
    key: 'study.interests',
    kind: 'state',
    area: 'estudos',
    text: "Interesses agora: AI-assisted software engineering, Claude e IA aplicada a Produto. Acompanha Product Talk, Lenny's Newsletter e The Pragmatic Engineer.",
  },
]

export const seedMemory: FeatureSeed = (ctx) => ({
  memory: MEMORY_SEED.map(({ key, ...m }) => ctx.make('memory', { id: seedId('memory', key), key, ...m, status: 'confirmed', source: 'seed' })),
})
