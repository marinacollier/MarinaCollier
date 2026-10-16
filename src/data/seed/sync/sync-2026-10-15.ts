/**
 * Marina's weekly sync of 15/10/2026 (backlog-2026-10-15.json + week-2026-10-15.md, next to this file) as
 * ONE marina-os/changes@1 batch. It is never written by itself: Home offers it ("Sincronização 15/10
 * pronta para revisar"), the Central Universal shows the per-item preview, and only her "Confirmar" writes.
 *
 * How each source item was mapped (her records win — nothing here overwrites what she did):
 * - backlog tasks: the JSON id is the sourceKey; an equivalent record that already exists (seed backlog of
 *   09/10, Daily Briefing of 12/10) is MOVED to the planned day (`suggested_date` → date) instead of
 *   duplicated; `due_date` stays the deadline (a past one = overdue only while not done);
 * - her checklist (.md): every line is pending; equivalent lines point at the same record as the JSON;
 * - money: bill categories and contracts are recognised (linked), never created with an amount; expected
 *   income is matched to the existing contracts' receivables — never marked as received;
 * - workouts: only what she said (4 km where given; no pace, HR, duration, loads); the weekly plan itself
 *   is untouched — the day's own records carry the week (a stored session of the plan that her week
 *   replaced is taken out of THAT day only);
 * - Pink Cheeks stays an affiliate without UGC openings: the race is a campaign project, not a paid deal.
 */
import { CHANGES_SCHEMA, type Change, type ChangesDoc } from '../../changes/contract'

const AFRICA = 'África do Sul'
const PNK = 'Pink Cheeks — Athenas Run Longer'

type C = Partial<Change> & Pick<Change, 'op' | 'type' | 'fields'>
const task = (sourceKey: string, fields: Change['fields'], extra: Partial<Change> = {}): C => ({ op: 'create', type: 'task', sourceKey, fields, ...extra })
/** An equivalent record already exists: give it the planned day (her title/notes stay). */
const moveTo = (sourceKey: string, target: { id?: string; title?: string }, fields: Change['fields']): C => ({ op: 'move', type: 'task', sourceKey, id: target.id, match: target.title ? { title: target.title } : undefined, fields })
const bill = (title: string): C => ({ op: 'create', type: 'recurring', fields: { title } })
const tripLink = (id: string, title: string, section: string, extra: Change['fields'] = {}): C => ({ op: 'create', type: 'tripItem', id, fields: { trip: AFRICA, title, section, ...extra } })
const pnk = (sourceKey: string, title: string, date: string, extra: Change['fields'] = {}): C => task(sourceKey, { title, date, project: PNK, brand: 'Pink Cheeks', context: 'conteudo', ...extra })
const OPEN_FORM = 'Formulário recebido/em preenchimento — envio NÃO confirmado (nenhum contato registrado).'

const CHANGES: C[] = [
  // ── Backlog JSON · tasks (32) ─────────────────────────────────────────────
  task('ff-go-no-go', { title: 'Homologar jornada crítica e definir Go/No-Go', project: 'Fashion Finder', context: 'trabalho', priority: 'P1', date: '2026-10-16', durationMin: 60, doneCriteria: 'Busca por imagem, ranking, fotos, disponibilidade e mobile testados; bloqueios classificados', notes: '16/10 era estimativa de conclusão de desenvolvimento, não publicação confirmada. Não marcar publicação nas lojas sem evidência.' }),
  moveTo('ff-apple', { id: 'seed:backlog:solucionar-conta-apple' }, { date: '2026-10-16' }),
  moveTo('ff-google', { id: 'seed:backlog:solucionar-conta-google' }, { date: '2026-10-16' }),
  moveTo('san-layout', { id: 'seed:backlog:revisar-epicos-de-layout' }, { date: '2026-10-16' }),
  moveTo('san-dup0005', { id: 'seed:backlog:revisar-dup0005-de-sacador' }, { date: '2026-10-16' }),
  moveTo('san-agendas', { id: 'seed:backlog:cobrar-agendas-necessarias' }, { date: '2026-10-16' }),
  task('recebimento-santander', { title: 'Conferir recebimento Santander previsto para 15/10', context: 'vida_real', priority: 'P2', date: '2026-10-16', dueDate: '2026-10-15', durationMin: 10, doneCriteria: 'R$ 20.000 conciliados ou pendência registrada', notes: 'Pagamento não confirmado — não registrar como recebido sem confirmação.' }),
  moveTo('bo-pedagio', { id: 'seed:backlog:abrir-b-o-de-pedagio' }, { date: '2026-10-17' }),
  moveTo('jnb-hotel-13', { title: 'Organizar hospedagem JNB' }, { date: '2026-10-17' }),
  task('jnb-hotel-15', { title: 'Confirmar hospedagem JNB de 15/11', trip: AFRICA, context: 'viagem', priority: 'P1', date: '2026-10-17', doneCriteria: 'Reserva confirmada e comprovante salvo', notes: 'Considerar voo de retorno 16/11' }, { match: { title: 'Organizar hospedagem JNB' } }),
  moveTo('jnb-safari', { id: 'seed:backlog:resolver-hospedagem-e-safari-jnb' }, { date: '2026-10-17', dueDate: null }),
  moveTo('multas-carro', { id: 'seed:backlog:resolver-multas-do-carro' }, { date: '2026-10-18', dueDate: null }),
  task('planejamento-semanal', { title: 'Planejar semana pré-viagem', context: 'trabalho', priority: 'P2', date: '2026-10-18', time: '19:00', durationMin: 25, doneCriteria: 'Prioridades 19–23/10 distribuídas e dependências identificadas', notes: 'Evento no calendário domingo às 19h' }),
  task('seguro-viagem', { title: 'Revisar seguro viagem e guardar comprovante', trip: AFRICA, context: 'viagem', priority: 'P2', date: '2026-10-18', durationMin: 30, doneCriteria: 'Cobertura vigente e apólice offline', notes: 'Pagamento já realizado (sync 15/10) — falta conferir cobertura e guardar a apólice offline.' }),
  moveTo('san-ativacao', { id: 'seed:backlog:escrever-epicos-de-ativacao-de-sacador' }, { date: '2026-10-19', dueDate: null }),
  moveTo('san-enquadramento', { id: 'seed:backlog:escrever-epicos-de-enquadramento-de-sacador' }, { date: '2026-10-20', dueDate: null }),
  moveTo('san-instrucoes', { id: 'seed:backlog:escrever-epicos-de-instrucoes' }, { date: '2026-10-21', dueDate: null }),
  task('san-handoff', { title: 'Alinhar responsáveis e continuidade Santander durante viagem', project: 'Santander', context: 'trabalho', priority: 'P2', date: '2026-10-21', durationMin: 25, doneCriteria: 'Status, responsáveis, decisões pendentes e próximos marcos alinhados' }),
  moveTo('ff-conta-pj', { id: 'seed:backlog:criar-conta-pj-para-fashion-finder' }, { date: '2026-10-19' }),
  moveTo('ff-linkedin', { id: 'seed:backlog:criar-pagina-no-linkedin-para-fashion-finder' }, { date: '2026-10-20' }),
  moveTo('ff-handoff', { title: 'Priorizar Fashion Finder' }, { date: '2026-10-21' }),
  task('os-claude', { title: 'Retomar melhorias do Marina OS no Claude', context: 'trabalho', priority: 'P3', date: '2026-10-19', durationMin: 40, doneCriteria: 'Pendências priorizadas e instruções enviadas ao Claude quando houver créditos', notes: 'Sem créditos durante a semana; não considerar feito.' }),
  task('os-import', { title: 'Testar importação e atualização de tarefas sem duplicação', context: 'trabalho', priority: 'P2', date: '2026-10-20', durationMin: 40, doneCriteria: 'JSON importado, tarefas persistidas, status marcável e idempotência verificada', notes: 'Integração nunca confirmada como concluída.' }),
  moveTo('linkedin-pessoal', { title: 'Revisar LinkedIn executivo' }, { date: '2026-10-20' }),
  moveTo('yoga-duda', { id: 'seed:backlog:definir-proximos-passos-com-duda' }, { date: '2026-10-21' }),
  moveTo('ing_exec', { title: 'Praticar inglês executivo' }, { date: '2026-10-20' }),
  task('recife-22', { title: 'Confirmar logística da etapa Recife de 22/10', trip: AFRICA, context: 'viagem', priority: 'P2', date: '2026-10-21', durationMin: 20, doneCriteria: 'Passagens e deslocamentos da etapa anterior ao voo internacional conferidos', notes: 'Viagem a Recife registrada em plano anterior; validar se permanece.' }),
  task('trip-documents', { title: 'Revisar documentos, voos, seguro, comprovantes e acesso offline', trip: AFRICA, context: 'viagem', priority: 'P1', date: '2026-10-22', durationMin: 35, doneCriteria: 'Passaporte, passagens, seguro, hospedagem, escola, transfer, comprovantes e contatos acessíveis offline', notes: 'Inclui documentos, vacinas e requisitos de entrada Brasil → África do Sul.' }),
  task('trip-money-connectivity', { title: 'Preparar conectividade, pagamento e compartilhamento de localização', trip: AFRICA, context: 'viagem', priority: 'P2', date: '2026-10-22', durationMin: 25, doneCriteria: 'SIM/eSIM ou roaming decidido, meios de pagamento conferidos e rastreamento familiar configurado', notes: 'Dinheiro, cartões, internet e rastreamento com a mãe.' }),
  task('trip-luggage', { title: 'Finalizar mala e equipamentos para África do Sul', trip: AFRICA, context: 'viagem', priority: 'P2', date: '2026-10-22', durationMin: 35, doneCriteria: 'Documentos, camadas para vento/frio, roupas, eletrônicos, equipamentos e itens essenciais conferidos', notes: 'Mala cápsula, equipamentos esportivos e eletrônicos — usar os looks já montados.' }),
  task('sars', { title: 'Conferir necessidade e enviar declaração SARS Traveller Declaration, se aplicável', trip: AFRICA, context: 'viagem', priority: 'P1', date: '2026-10-23', dueDate: '2026-10-23', durationMin: 20, doneCriteria: 'Procedimento oficial aplicável verificado e, se requerido, declaração enviada e comprovante offline', notes: 'Checar exigência atual; não presumir obrigação para toda viagem.' }),
  task('flight-final', { title: 'Conferir check-in, embarque e deslocamento de 24/10', trip: AFRICA, context: 'viagem', priority: 'P1', date: '2026-10-23', dueDate: '2026-10-23', durationMin: 20, doneCriteria: 'Horários, check-in, regras de bagagem e transporte ao aeroporto conferidos' }),

  // ── Backlog JSON · waiting (no daily checklist) ───────────────────────────
  { op: 'create', type: 'waiting', sourceKey: 'dayone-vitor', fields: { title: 'Aguardar retorno do Vitor', who: 'Vitor', project: 'Day One', notes: 'Verificar resposta; follow-up só quando necessário' } },
  { op: 'create', type: 'waiting', sourceKey: 'tranquilo-thales', fields: { title: 'Aguardar retorno do Thales', who: 'Thales', project: 'Tranquilo SP', notes: 'Verificar resposta; follow-up só quando necessário' } },

  // ── Backlog JSON · confirmed_completed (history: done, no day on Home) ────
  task('agents-initial', { title: 'Fazer/ajustar agentes prioritários', status: 'done', completedOn: '2026-10-15', context: 'trabalho', tags: ['histórico'] }),
  task('lovable-initial', { title: 'Atualização inicial do Lovable', status: 'done', completedOn: '2026-10-15', context: 'trabalho', tags: ['histórico'] }),
  task('os-tasks-schema', { title: 'Definir estrutura inicial de tarefas do Marina OS', status: 'done', completedOn: '2026-10-15', context: 'trabalho', tags: ['histórico'] }),

  // ── Backlog JSON · financial_registry (recognised, never an amount or a payment) ──
  ...['Carro', 'Aluguel', 'Faculdade', 'Seguro Setembro', 'Seguro Outubro', 'Seguro Bike', 'Plano de saúde', 'Enel', 'Plano de Luna', 'Cartão de Crédito BV', 'Cartão de Crédito Rico', 'Cartão de Crédito Neon', 'Cartão de Crédito C6', 'Dívida Banco do Brasil', 'Mercado Livre', 'Assinaturas', 'Ração Luna', 'Gasolina', 'Multas', 'Pedágio', 'Feira', 'Hortifruti e carnes', 'Material de limpeza', 'Estacionamento Santander — reembolso', 'Estacionamento pessoal'].map(bill),
  // ── expected_income (expected, unverified — the contracts' own receivables) ──
  { op: 'create', type: 'expectedRevenue', fields: { title: 'Santander PJ', amountCents: 2_000_000, date: '2026-10-15' } },
  { op: 'create', type: 'expectedRevenue', fields: { title: 'Fashion Finder PJ', amountCents: 1_000_000, date: '2026-10-30' } },

  // ── Treinos 12–18/10 (only what she said) ─────────────────────────────────
  { op: 'create', type: 'completedWorkout', sourceKey: 'treino-2026-10-12-bike', fields: { date: '2026-10-12', modality: 'bike', title: 'Bike', notes: 'Realizada · distância, duração e intensidade pendentes' } },
  { op: 'create', type: 'completedWorkout', sourceKey: 'treino-2026-10-13-corrida', fields: { date: '2026-10-13', modality: 'corrida', title: 'Corrida 4 km', distanceKm: 4, notes: 'Realizada · pace e duração pendentes' } },
  { op: 'create', type: 'completedWorkout', sourceKey: 'treino-2026-10-14-superiores', fields: { date: '2026-10-14', modality: 'musculacao', title: 'Superiores', notes: 'Realizado · exercícios e cargas pendentes' } },
  { op: 'create', type: 'completedWorkout', sourceKey: 'treino-2026-10-15-corrida', fields: { date: '2026-10-15', modality: 'corrida', title: 'Corrida 4 km', distanceKm: 4, notes: 'Realizada · pace e duração pendentes' } },
  { op: 'create', type: 'plannedWorkout', sourceKey: 'treino-2026-10-15-yoga', fields: { date: '2026-10-15', modality: 'yoga', title: 'Yoga', notes: 'Prevista · ainda não confirmada' } },
  { op: 'create', type: 'recurring', fields: { title: 'Fisioterapia' } },
  { op: 'archive', type: 'plannedWorkout', sourceKey: 'treino-2026-10-16-sem-longao', match: { date: '2026-10-16', title: 'Corrida longa Z2' }, fields: { modality: 'corrida' } },
  { op: 'create', type: 'plannedWorkout', sourceKey: 'treino-2026-10-16-natacao', fields: { date: '2026-10-16', modality: 'natacao', title: 'Natação leve (opcional)', intensity: 'leve', notes: 'Opcional · apenas leve, se recuperada. Fisioterapia 12h: alinhar intensidade pré-prova.' } },
  { op: 'create', type: 'plannedWorkout', sourceKey: 'treino-2026-10-17-descanso', fields: { date: '2026-10-17', modality: 'recuperacao', title: 'Descanso', rest: true, notes: 'Sem pedal ou circo' } },
  { op: 'archive', type: 'plannedWorkout', sourceKey: 'treino-2026-10-18-sem-pedal', match: { date: '2026-10-18', title: 'Pedal longo' }, fields: { modality: 'bike' } },
  { op: 'create', type: 'plannedWorkout', sourceKey: 'treino-2026-10-18-athenas', fields: { date: '2026-10-18', modality: 'corrida', time: '06:00', title: 'Prova Athenas Run Longer 14 km', plannedDistanceKm: 14, notes: 'Estratégia conservadora · camiseta Pink Cheeks obrigatória · registrar o resultado real' } },

  // ── Pink Cheeks — Athenas Run Longer (campaign of an affiliate; NOT a paid deal) ──
  { op: 'create', type: 'project', sourceKey: 'pnk-athenas', fields: { name: PNK, status: 'ativo', priority: 'alta', deadline: '2026-10-18', description: 'Participação no PNK Squad na Athenas Run Longer (18/10). Pink Cheeks é afiliada sem vagas de UGC — campanha sem pagamento comprovado, não é UGC remunerado. Camiseta Pink Cheeks obrigatória na prova; marcações @pinkcheeksbrasil #PNKTEAM #SQUADPNKATHENAS.', nextAction: 'Retirar o kit até 17/10' } },
  pnk('pnk-stories', 'Publicar stories de anúncio do PNK Squad', '2026-10-15', { dueDate: '2026-10-15', priority: 'P1', notes: 'Prazo obrigatório 15/10' }),
  pnk('pnk-kit', 'Retirar kit Pink Cheeks e kit da prova — Shopping Market Place', '2026-10-15', { dueDate: '2026-10-17', priority: 'P1', notes: 'Retirada entre 15 e 17/10' }),
  pnk('pnk-fotos-camila', 'Separar fotos e vídeos da cirurgia, fisioterapia e volta à corrida — enviar para Camila', '2026-10-15'),
  pnk('pnk-depoimento', 'Gravar depoimento no sofá para o vídeo 1 (máx. 90 s)', '2026-10-15'),
  pnk('pnk-video1', 'Revisar edição e publicar o vídeo 1 — retrospectiva do joelho', '2026-10-16'),
  { op: 'create', type: 'waiting', sourceKey: 'pnk-etapa04', fields: { title: 'Etapa 04 do briefing (não recebida)', who: 'Pink Cheeks', since: '2026-10-15', followUpOn: '2026-10-16', project: PNK, notes: 'Conferir com a marca a Etapa 04 ausente do briefing.' } },
  pnk('pnk-kit-stand', 'Gravar preparativos e kit completo — feed + cobertura do stand', '2026-10-17'),
  pnk('pnk-video2', 'Produzir vídeo 2 — retorno aos treinos e preparação', '2026-10-17'),
  pnk('pnk-captacao-equip', 'Separar e testar equipamentos de captação para a prova — celular, bateria, suporte, armazenamento', '2026-10-17'),
  task('prova-plano-corrida', { title: 'Confirmar plano de corrida, hidratação e recuperação — sem suplementação nova', context: 'geral', date: '2026-10-17' }),
  pnk('pnk-captar-prova', 'Captar largada, percurso, chegada, medalha e reação — sem comprometer a segurança', '2026-10-18', { checklist: ['Camiseta Pink Cheeks na prova (obrigatória)', 'Marcar @pinkcheeksbrasil', '#PNKTEAM', '#SQUADPNKATHENAS'] }),
  pnk('pnk-video3', 'Publicar conteúdo principal da prova — vídeo 3: corrida de 14 km e superação', '2026-10-18', { notes: 'Domingo à noite, se a edição estiver pronta' }),
  pnk('pnk-relato', 'Publicar relato final Pink Cheeks — produtos usados e sentimentos reais', '2026-10-19'),

  // ── CRM UGC (existing ugc ops; no duplicates) ─────────────────────────────
  { op: 'create', type: 'ugcDeal', sourceKey: 'crm-woom-proposta', fields: { brand: 'Woom', proposalSentOn: '2026-10-13', nextFollowUpAt: '2026-10-20', notes: 'Proposta enviada em 13/10 — aguardando resposta. Conferir respostas antes do follow-up.' } },
  { op: 'create', type: 'ugcDeal', sourceKey: 'crm-ange-proposta', fields: { brand: 'Angê', proposalSentOn: '2026-10-13', nextFollowUpAt: '2026-10-20' } },
  { op: 'create', type: 'ugcProspect', sourceKey: 'crm-kamit', fields: { name: 'KAMIT', notes: OPEN_FORM } },
  { op: 'create', type: 'ugcDeal', sourceKey: 'crm-zerezes', fields: { brand: 'Zerezes', notes: OPEN_FORM } },
  // The CRM already records a proposal of 11/10 for Flower Club: kept; the sync's version goes into the note for her to check.
  { op: 'create', type: 'ugcDeal', sourceKey: 'crm-flowerclub', fields: { brand: 'Flower Club', notes: `Sync 15/10: ${OPEN_FORM} O CRM registra proposta enviada em 11/10 — conferir qual vale.` } },
  { op: 'create', type: 'ugcProspect', sourceKey: 'crm-carolinaluna', fields: { name: 'Carolina Luna', notes: OPEN_FORM } },
  { op: 'create', type: 'ugcProspect', sourceKey: 'crm-viggi', fields: { name: 'VIGGI', notes: 'Contato da Laís recebido; mensagem ainda não confirmada.' } },
  task('ugc-formularios', { title: 'Confirmar envio dos formulários KAMIT, Zerezes, Flower Club e Carolina Luna', project: 'UGC / Creator', context: 'conteudo', date: '2026-10-19' }),
  task('ugc-viggi-lais', { title: 'Confirmar contato com Laís (VIGGI)', project: 'UGC / Creator', context: 'conteudo', date: '2026-10-19' }),
  task('ugc-respostas-11-12', { title: 'Revisar respostas das prospecções UGC de 11 e 12/10', project: 'UGC / Creator', context: 'conteudo', date: '2026-10-20' }, { id: 'ugc-crm:task:respostas-11-10' }),
  task('ugc-crm-categorias', { title: 'Revisar CRM de afiliadas, permutas, press kits e UGC pago — categorias separadas', project: 'UGC / Creator', context: 'conteudo', date: '2026-10-20' }),

  // ── Her checklist (.md) — lines without a JSON twin ───────────────────────
  moveTo('santander-prioridades-1015', { title: 'Preparar pauta Santander' }, { date: '2026-10-15' }),
  task('progresso-ff-santander', { title: 'Revisar progresso Fashion Finder e Santander', context: 'trabalho', date: '2026-10-21' }),
  task('escola-hospedagem-cape-town', { title: 'Conferir pendências da escola e hospedagem em Cape Town', trip: AFRICA, context: 'viagem', date: '2026-10-22' }),
  { op: 'create', type: 'backlog', sourceKey: 'ff-contas-integracoes', match: { title: 'Apple, Google, PJ e LinkedIn' }, fields: { title: 'Fashion Finder: contas Apple/Google, CNPJ, LinkedIn e integrações de catálogo', project: 'Fashion Finder', notes: 'Conferir o que já foi feito.' } },
  { op: 'create', type: 'recurring', fields: { title: 'Pagamentos mensais' } },

  // ── Viagem África do Sul (existing trip items; itinerary and looks untouched) ──
  tripLink('seed:travel:trip-africa-do-sul-seguro', 'Seguro', 'documento', { paymentStatus: 'pago' }),
  tripLink('seed:travel:trip-africa-do-sul-hosp-johannesburg', 'Hospedagem Johannesburg', 'hospedagem', { notes: 'Verificar 13/11 e 15/11 (safari 14–15/11 no meio).' }),
  tripLink('seed:travel:trip-africa-do-sul-safari-dias', 'Safari', 'roteiro', { notes: 'Já planejado — não reservar de novo; conferir comprovante, coleta e retorno.' }),
  tripLink('seed:travel:trip-africa-do-sul-safari', 'Reserva do safari', 'reserva'),
  tripLink('seed:travel:trip-africa-do-sul-transfers', 'Transfers', 'transporte'),
  tripLink('seed:travel:trip-africa-do-sul-documentos', 'Documentos', 'documento'),
  tripLink('seed:travel:trip-africa-do-sul-vacinas', 'Vacinas/certificados', 'antes_de_ir'),
  tripLink('seed:travel:trip-africa-do-sul-visto', 'Visto/requisitos de entrada', 'antes_de_ir'),
  tripLink('seed:travel:trip-africa-do-sul-packing', 'Packing', 'mala'),
  tripLink('seed:travel:trip-africa-do-sul-equip-esportivo', 'Equipamento esportivo', 'mala'),
  tripLink('seed:travel:trip-africa-do-sul-equip-conteudo', 'Equipamento de conteúdo', 'mala'),
  tripLink('seed:travel:trip-africa-do-sul-escola', 'Escola / intercâmbio', 'reserva'),
  tripLink('seed:travel:trip-africa-do-sul-hosp-cape-town', 'Hospedagem Cape Town', 'hospedagem'),
  tripLink('seed:travel:trip-africa-do-sul-dinheiro-cartoes', 'Dinheiro / cartões', 'antes_de_ir'),
  tripLink('seed:travel:trip-africa-do-sul-esim', 'Internet / eSIM', 'comprar'),
  { op: 'create', type: 'tripItem', sourceKey: 'trip-rastreamento-mae', fields: { trip: AFRICA, title: 'Compartilhar localização com a mãe', section: 'antes_de_ir', group: 'Comunicação' } },
]

export const SYNC_2026_10_15 = {
  id: '2026-10-15',
  label: 'Sincronização 15/10',
  /** Offered on Home from this day… */
  from: '2026-10-15',
  /** …until this day (inclusive). */
  until: '2026-10-31',
  doc: { schemaVersion: CHANGES_SCHEMA, generatedAt: '2026-10-16T09:00:00-03:00', source: 'Sincronização semanal 15/10', changes: CHANGES } as unknown as ChangesDoc,
}
