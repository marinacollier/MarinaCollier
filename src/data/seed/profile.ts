/**
 * Marina's profile + planning rules, as seed DATA (reference date 02/10/2026).
 * Everything here is editable in the app (Ajustes → Meu ritmo / Trabalho, Corpo → Regras).
 */
import type { FeatureSeed } from './context'
import { seedId } from './context'
import { SEED_IDS } from './ids'

export const seedProfile: FeatureSeed = (ctx) => ({
  profile: {
    name: 'Marina',
    homeBase: 'São Paulo',
    about:
      'Trabalho com Produto, Tecnologia e Inteligência Artificial, com vários projetos ao mesmo tempo. ' +
      'Minha vida tem muito esporte, viagens, estudos, conteúdo, vida social e projetos pessoais — e a Luna 🐾. ' +
      'A rotina muda bastante: estrutura sem rigidez.',
    rhythm: { wakeTime: '04:40', sleepTime: '22:00' },
    work: {
      start: '09:00',
      end: '18:00',
      location: 'Interlagos, São Paulo',
      // 0 = domingo. Terça e quarta presenciais; seg/qui/sex remotas; fim de semana livre. Tudo editável.
      days: { 0: 'off', 1: 'remoto', 2: 'presencial', 3: 'presencial', 4: 'remoto', 5: 'remoto', 6: 'off' },
      commuteBeforeMin: 60,
      commuteAfterMin: 60,
      presencialChecklist: [
        'Roupa',
        'Notebook',
        'Carregador',
        'Garrafa',
        'Itens de treino (se tiver treino)',
        'Coisas da Luna',
        'Almoço / lanche, se precisar',
      ],
    },
    homeWidgets: [
      { id: 'agora', visible: true },
      { id: 'top3', visible: true },
      { id: 'manha', visible: true },
      { id: 'proximo_compromisso', visible: true },
      { id: 'treino', visible: true },
      { id: 'work_focus', visible: true },
      { id: 'proxima_viagem', visible: true },
      { id: 'brain_dump', visible: true },
      { id: 'refeicoes', visible: true },
      { id: 'gastos', visible: true },
      { id: 'estudo_atual', visible: true },
      { id: 'lendo_agora', visible: true },
      { id: 'resumo_dia', visible: true },
      { id: 'amanha', visible: true },
      { id: 'fechamento', visible: true },
      { id: 'tarefas', visible: true },
      { id: 'luna', visible: true },
      { id: 'waiting_for', visible: false },
      { id: 'countdown', visible: false },
    ],
  },
  constraints: [
    ctx.make('constraints', {
      id: seedId('planning', 'totalpass'),
      name: 'TotalPass — 1 check-in/dia',
      kind: 'max_checkins_per_day',
      limit: 1,
      modalities: ['natacao', 'yoga', 'musculacao'],
      active: true,
      notes: 'Não dá pra usar alguns lugares/atividades via TotalPass duas vezes no mesmo dia (ex.: natação + yoga). Ajuste as modalidades conforme seus locais.',
    }),
    ctx.make('constraints', {
      id: seedId('planning', 'yoga-app-1h'),
      name: 'Yoga App — até 1h/dia',
      kind: 'max_minutes_per_day',
      limit: 60,
      projectId: SEED_IDS.projYoga,
      active: true,
      notes: 'Dedicação aproximada máxima. Não agendar 3h numa tarde.',
    }),
  ],
})
