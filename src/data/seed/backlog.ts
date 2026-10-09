/**
 * Marina's backlog as she sent it (Manual Backlog Update, 09/10/2026) — the same mapping the Lumos
 * briefing import uses, with stable ids so existing installs receive it once (seed migration, additive)
 * and never twice. Payments come in as categories with a check and no amount (she gives values).
 */
import type { FinancialCategory, NewItem } from '../types'
import { categoryFromBill, findProject, taskFromBriefing, type BriefingBlock } from '../briefing/import'
import { seedId, type FeatureSeed } from './context'
import { SEED_IDS } from './ids'

export const BACKLOG_2026_10_09: BriefingBlock = {
  date: '2026-10-09',
  source: 'Manual Backlog Update',
  tasks: [
    { title: 'Abrir B.O de pedágio', category: 'Logística', project: 'Vida/Admin', priority: 'P1', done_criteria: 'B.O aberto e comprovante salvo.', estimated_minutes: 30, status: 'todo', due_date: '2026-10-10' },
    { title: 'Resolver multas do carro', category: 'Logística', project: 'Vida/Admin', priority: 'P2', done_criteria: 'Multas consultadas, situação entendida e próximos passos/pagamento definidos.', estimated_minutes: 45, status: 'todo', due_date: '2026-10-16' },
    { title: 'Resolver hospedagem e safari JNB', category: 'Viagem', project: 'África do Sul', priority: 'P2', done_criteria: 'Hospedagem e safari em Johannesburg definidos ou pré-reservados.', estimated_minutes: 60, status: 'todo', due_date: '2026-10-16' },
    { title: 'Revisar épicos de layout', category: 'Operação', project: 'Santander', priority: 'P2', done_criteria: 'Épicos revisados e comentários/dúvidas registrados.', estimated_minutes: 45, status: 'todo', due_date: '2026-10-16' },
    { title: 'Revisar DUP0005 de sacador', category: 'Operação', project: 'Santander', priority: 'P2', done_criteria: 'Épico DUP0005 revisado e próximo passo definido.', estimated_minutes: 45, status: 'todo', due_date: '2026-10-16' },
    { title: 'Escrever épicos de ativação de sacador', category: 'Operação', project: 'Santander', priority: 'P2', done_criteria: 'Épicos de ativação escritos ou rascunhados.', estimated_minutes: 60, status: 'todo', due_date: '2026-10-16' },
    { title: 'Escrever épicos de enquadramento de sacador', category: 'Operação', project: 'Santander', priority: 'P2', done_criteria: 'Épicos de enquadramento escritos ou rascunhados.', estimated_minutes: 60, status: 'todo', due_date: '2026-10-16' },
    { title: 'Escrever épicos de instruções', category: 'Operação', project: 'Santander', priority: 'P2', done_criteria: 'Épicos de instruções escritos ou rascunhados.', estimated_minutes: 60, status: 'todo', due_date: '2026-10-16' },
    { title: 'Cobrar agendas necessárias', category: 'Operação', project: 'Santander', priority: 'P3', done_criteria: 'Agendas cobradas ou remarcadas com responsáveis acionados.', estimated_minutes: 20, status: 'todo', due_date: '2026-10-16' },
    { title: 'Solucionar conta Apple', category: 'Produto/IA', project: 'Fashion Finder', priority: 'P1', done_criteria: 'Conta Apple regularizada ou bloqueio técnico documentado.', estimated_minutes: 45, status: 'todo', due_date: null },
    { title: 'Solucionar conta Google', category: 'Produto/IA', project: 'Fashion Finder', priority: 'P1', done_criteria: 'Conta Google regularizada ou bloqueio técnico documentado.', estimated_minutes: 45, status: 'todo', due_date: null },
    { title: 'Criar conta PJ para Fashion Finder', category: 'Operação', project: 'Fashion Finder', priority: 'P2', done_criteria: 'Conta PJ criada ou checklist de abertura definido.', estimated_minutes: 60, status: 'todo', due_date: null },
    { title: 'Criar página no LinkedIn para Fashion Finder', category: 'Carreira', project: 'Fashion Finder', priority: 'P2', done_criteria: 'Página criada com descrição, logo/imagem e dados básicos.', estimated_minutes: 30, status: 'todo', due_date: null },
    { title: 'Definir próximos passos com Duda', category: 'Operação', project: 'Yoga App', priority: 'P3', done_criteria: 'Próximos passos definidos ou mensagem enviada para alinhamento.', estimated_minutes: 20, status: 'todo', due_date: null },
    { title: 'Aguardar retorno do Vitor', category: 'Operação', project: 'Day One', priority: 'P3', done_criteria: 'Retorno recebido ou follow-up enviado se passar do prazo.', estimated_minutes: 5, status: 'waiting', due_date: null },
    { title: 'Aguardar retorno do Thales', category: 'Operação', project: 'Tranquilo SP', priority: 'P3', done_criteria: 'Retorno recebido ou follow-up enviado se passar do prazo.', estimated_minutes: 5, status: 'waiting', due_date: null },
  ],
  recurring_financial_categories: [
    'Carro',
    'Aluguel',
    'Faculdade',
    'Seguro Setembro',
    'Seguro Outubro',
    'Seguro Bike',
    'Plano de saúde',
    'Enel',
    'Plano de Luna',
    'Cartão de Crédito BV',
    'Cartão de Crédito Rico',
    'Cartão de Crédito Neon',
    'Cartão de Crédito C6',
    'Dívida Banco do Brasil',
    'Mercado Livre',
    'Assinaturas',
    'Ração Luna',
    'Gasolina',
    'Multas',
    'Pedágio',
    'Feira',
    'Hortifruti e carnes — semanal',
    'Material de limpeza',
    'Estacionamento Santander — reembolso',
    'Estacionamento pessoal',
    'Inglês',
    'Ajuda vó $',
    'Ajuda mãe $',
  ],
}

export const TRANQUILO_SP_ID = seedId('work', 'tranquilo-sp')

const PROJECTS = [
  { id: SEED_IDS.projSantander, name: 'Santander' },
  { id: SEED_IDS.projFashionFinder, name: 'FashionFinder' },
  { id: SEED_IDS.projDayOne, name: 'Day One AI' },
  { id: SEED_IDS.projYoga, name: 'Yoga App' },
  { id: TRANQUILO_SP_ID, name: 'Tranquilo SP' },
]

export const seedBacklog: FeatureSeed = (ctx) => {
  const b = BACKLOG_2026_10_09
  const projects = [
    ctx.make('projects', { id: TRANQUILO_SP_ID, name: 'Tranquilo SP', emoji: '🌿', tone: 'sage', status: 'ativo', priority: 'baixa', links: [], files: [], people: [{ name: 'Thales' }], decisions: [], changelog: [], kind: 'default', order: 5 }),
  ]
  const tasks = b.tasks.map((t, i) =>
    ctx.make('tasks', {
      ...taskFromBriefing(t, b, { africaTripId: SEED_IDS.tripAfrica, order: 500 + i }),
      id: seedId('backlog', t.title),
      projectId: findProject(PROJECTS, t.project)?.id,
    } as NewItem<'tasks'>),
  )
  const financialCategories: FinancialCategory[] = (b.recurring_financial_categories ?? []).map((raw, i) => {
    const c = categoryFromBill(raw, 100 + i)
    return { ...c, createdAt: ctx.now, updatedAt: ctx.now }
  })
  return { projects, tasks, financialCategories }
}
