/**
 * Marina's Daily Executive Briefing of 12/10/2026, exactly as she sent it. It reaches her real device
 * THROUGH the importer (planBriefing → applyPlan) — never as seed records — so the same reconciliation
 * rules apply to her persisted data: what she already did, moved or edited stays as she left it.
 * Runs once per install (profile.briefingsApplied); running it again is a no-op (sourceKeys).
 * Also the payload Lumos uses for "Importa meu Daily Briefing de hoje" when no JSON is pasted.
 */
import type { BriefingBlock } from '../briefing/import'

export const BRIEFING_2026_10_12: BriefingBlock = {
  date: '2026-10-12',
  source: 'Daily Executive Briefing',
  tasks: [
    { title: 'Revisar LinkedIn executivo', category: 'Carreira', project: 'Carreira', priority: 'P1', done_criteria: 'Headline e 3 evidências revisadas', estimated_minutes: 25, status: 'todo', due_date: '2026-10-12' },
    { title: 'Priorizar Fashion Finder', category: 'Produto/IA', project: 'Fashion Finder', priority: 'P2', done_criteria: 'Bloqueios e responsáveis definidos', estimated_minutes: 25, status: 'todo', due_date: '2026-10-12' },
    { title: 'Preparar pauta Santander', category: 'Operação', project: 'Santander', priority: 'P3', done_criteria: 'Épicos e agendas priorizados', estimated_minutes: 20, status: 'todo', due_date: '2026-10-12' },
    { title: 'Regularizar B.O. de pedágio', category: 'Logística', project: 'Vida/Admin', priority: 'P2', done_criteria: 'Registro confirmado ou realizado', estimated_minutes: 20, status: 'todo', due_date: '2026-10-10' },
    { title: 'Organizar hospedagem JNB', category: 'Viagem', project: 'África do Sul', priority: 'P2', done_criteria: 'Pendências e próximos passos definidos', estimated_minutes: 20, status: 'todo', due_date: '2026-10-12' },
    { title: 'Praticar inglês executivo', category: 'Inglês', project: 'Carreira', priority: 'Optional', done_criteria: 'Prática oral concluída', estimated_minutes: 15, status: 'todo', due_date: null },
  ],
  backlog_watchlist: [
    { title: 'Épicos e agendas', project: 'Santander', status: 'scheduled', notes: 'Executar entre 13 e 16/10' },
    { title: 'Apple, Google, PJ e LinkedIn', project: 'Fashion Finder', status: 'scheduled', notes: 'Pendências de lançamento' },
    { title: 'Resolver multas', project: 'Vida/Admin', status: 'scheduled', notes: 'Semana de 12 a 16/10' },
    { title: 'Confirmar hospedagem e safari', project: 'África do Sul', status: 'scheduled', notes: 'Resolver antes da viagem' },
    { title: 'Alinhar próximos passos com Duda', project: 'Yoga App', status: 'scheduled', notes: 'Contato pendente' },
    { title: 'Retorno do Vitor', project: 'Day One', status: 'waiting', notes: 'Aguardar resposta' },
    { title: 'Retorno do Thales', project: 'Tranquilo SP', status: 'waiting', notes: 'Aguardar resposta' },
    { title: 'Pagamentos mensais', project: 'Vida/Admin', status: 'recurring', notes: 'Valores e vencimentos ajustáveis' },
  ],
}
