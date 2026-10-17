import type {
  BriefingDraft,
  DemoEvent,
  EventPrepState,
  MarketingTemplate,
  Partner,
  Plaza,
  Playbook,
  PrepTask,
  SalesSnapshot,
} from '../types';

export const DEMO_NOTICE = 'Ambiente demonstrativo · todos os dados operacionais e indicadores são fictícios.';

export const DEMO_PLAZA: Plaza = {
  id: 'sao-paulo',
  name: 'São Paulo',
  shortName: 'SP',
  accent: '#8992ff',
  isDemo: true,
};

export const DEMO_PLAZA_ALT: Plaza = {
  id: 'demo-plaza-02',
  name: 'Praça Exemplo 02',
  shortName: 'P2',
  accent: '#f5c4d2',
  isDemo: true,
};

export const DEMO_PLAZAS: Plaza[] = [DEMO_PLAZA, DEMO_PLAZA_ALT];

export const DEMO_EVENT: DemoEvent = {
  id: 'demo-event-001',
  plazaId: DEMO_PLAZA.id,
  partnerIds: ['partner-franchise-demo', 'partner-production-demo', 'partner-marketing-demo'],
  title: 'Encontro de novembro · edição demonstrativa',
  date: '2026-11-21',
  venue: 'Casa Exemplo · espaço fictício',
  format: 'Encontro ao vivo',
  status: 'Preparação em andamento',
  city: 'São Paulo',
  isDemo: true,
};

export const DEMO_EVENT_ALT: DemoEvent = {
  id: 'demo-event-002',
  plazaId: DEMO_PLAZA_ALT.id,
  partnerIds: ['partner-franchise-demo-2', 'partner-production-demo-2', 'partner-marketing-demo-2'],
  title: 'Encontro de dezembro · exemplo',
  date: '2026-12-12',
  venue: 'Espaço Exemplo 02 · fictício',
  format: 'Show intimista',
  status: 'Rascunho demonstrativo',
  city: DEMO_PLAZA_ALT.name,
  isDemo: true,
};

export const DEMO_EVENTS: DemoEvent[] = [DEMO_EVENT, DEMO_EVENT_ALT];

/** Papéis operacionais fictícios; não são usuários, contas ou sessões de acesso. */
export const DEMO_PARTNERS: Partner[] = [
  { id: 'partner-franchise-demo', displayName: 'Franquia', role: 'Responsável local', plazaIds: [DEMO_PLAZA.id], isDemo: true },
  { id: 'partner-production-demo', displayName: 'Produção local', role: 'Produção', plazaIds: [DEMO_PLAZA.id], isDemo: true },
  { id: 'partner-marketing-demo', displayName: 'Marketing central', role: 'Marketing', plazaIds: [DEMO_PLAZA.id], isDemo: true },
  { id: 'partner-franchise-demo-2', displayName: 'Franquia · exemplo 02', role: 'Responsável local', plazaIds: [DEMO_PLAZA_ALT.id], isDemo: true },
  { id: 'partner-production-demo-2', displayName: 'Produção local · exemplo 02', role: 'Produção', plazaIds: [DEMO_PLAZA_ALT.id], isDemo: true },
  { id: 'partner-marketing-demo-2', displayName: 'Marketing central · exemplo 02', role: 'Marketing', plazaIds: [DEMO_PLAZA_ALT.id], isDemo: true },
];

const DEMO_PRIMARY_TASKS: PrepTask[] = [
  { id: 'confirm-format', eventId: DEMO_EVENT.id, plazaId: DEMO_PLAZA.id, responsiblePartnerIds: ['partner-franchise-demo', 'partner-production-demo'], title: 'Alinhar formato e objetivo do encontro', owner: 'Franquia', dueLabel: 'Hoje', group: 'Operação', status: 'done', resource: 'event-basics', isDemo: true },
  { id: 'venue-check', eventId: DEMO_EVENT.id, plazaId: DEMO_PLAZA.id, responsiblePartnerIds: ['partner-production-demo'], title: 'Validar capacidade e mapa do espaço', owner: 'Produção local', dueLabel: 'Em 2 dias', group: 'Produção', status: 'in_progress', resource: 'venue-checklist', isDemo: true },
  { id: 'campaign-copy', eventId: DEMO_EVENT.id, plazaId: DEMO_PLAZA.id, responsiblePartnerIds: ['partner-franchise-demo', 'partner-marketing-demo'], title: 'Preparar texto-base de divulgação', owner: 'Franquia', dueLabel: 'Em 3 dias', group: 'Marketing', status: 'not_started', resource: 'campaign-starter', isDemo: true },
  { id: 'ticket-review', eventId: DEMO_EVENT.id, plazaId: DEMO_PLAZA.id, responsiblePartnerIds: ['partner-marketing-demo'], title: 'Revisar informações para a página do evento', owner: 'Marketing central', dueLabel: 'Em 4 dias', group: 'Marketing', status: 'not_started', resource: 'campaign-starter', isDemo: true },
  { id: 'show-run', eventId: DEMO_EVENT.id, plazaId: DEMO_PLAZA.id, responsiblePartnerIds: ['partner-production-demo'], title: 'Montar sequência do dia do evento', owner: 'Produção local', dueLabel: 'Em 5 dias', group: 'Produção', status: 'not_started', resource: 'run-of-show', isDemo: true },
];

export const PREP_TASKS: PrepTask[] = [
  ...DEMO_PRIMARY_TASKS,
  ...DEMO_PRIMARY_TASKS.map((task) => ({
    ...task,
    id: `${task.id}-event-002`,
    eventId: DEMO_EVENT_ALT.id,
    plazaId: DEMO_PLAZA_ALT.id,
    responsiblePartnerIds: task.responsiblePartnerIds.map((id) => `${id}-2`),
    isDemo: true as const,
  })),
];

export const INITIAL_PREP_STATE: EventPrepState = {
  eventId: DEMO_EVENT.id,
  plazaId: DEMO_PLAZA.id,
  city: DEMO_EVENT.city,
  title: DEMO_EVENT.title,
  date: DEMO_EVENT.date,
  venue: DEMO_EVENT.venue,
  format: DEMO_EVENT.format,
  objective: 'Criar um encontro acolhedor e apresentar a programação da praça.',
  audience: 'Pessoas da comunidade local que gostam de música ao vivo.',
  channels: ['Instagram', 'WhatsApp'],
  notes: '',
  checkedTaskIds: ['confirm-format'],
  activeStep: 0,
};

export const INITIAL_PREP_STATES: Record<string, EventPrepState> = {
  [DEMO_EVENT.id]: INITIAL_PREP_STATE,
  [DEMO_EVENT_ALT.id]: {
    ...INITIAL_PREP_STATE,
    eventId: DEMO_EVENT_ALT.id,
    plazaId: DEMO_EVENT_ALT.plazaId,
    city: DEMO_EVENT_ALT.city,
    title: DEMO_EVENT_ALT.title,
    date: DEMO_EVENT_ALT.date,
    venue: DEMO_EVENT_ALT.venue,
    format: DEMO_EVENT_ALT.format,
    objective: 'Organizar um encontro demonstrativo para a praça exemplo.',
    checkedTaskIds: [],
    activeStep: 0,
  },
};

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'event-basics',
    title: 'Comece pelo objetivo do evento',
    description: 'Transforme a ideia do encontro em um norte compartilhado pela equipe local.',
    category: 'Produção',
    topic: 'Contexto do encontro',
    owner: 'Franquia + Produção local',
    ownerPartnerIds: ['partner-franchise-demo', 'partner-production-demo', 'partner-franchise-demo-2', 'partner-production-demo-2'],
    scope: { visibility: 'plaza', plazaIds: DEMO_PLAZAS.map((plaza) => plaza.id) },
    eventStage: 'context',
    duration: '10 min',
    steps: ['Defina o motivo principal do encontro.', 'Descreva quem você quer receber.', 'Escolha um formato que caiba na praça.', 'Registre o próximo passo e quem o conduz.'],
    material: 'Use a etapa “Contexto” na preparação do evento para guardar as decisões da praça.',
    version: 'demo-1',
    updatedAt: '2026-10-16',
    isDemo: true,
  },
  {
    id: 'venue-checklist',
    title: 'Checklist de espaço e produção',
    description: 'Faça uma checagem prática de acesso, capacidade, infraestrutura e acolhimento.',
    category: 'Produção',
    topic: 'Espaço e produção',
    owner: 'Produção local',
    ownerPartnerIds: ['partner-production-demo', 'partner-production-demo-2'],
    scope: { visibility: 'plaza', plazaIds: DEMO_PLAZAS.map((plaza) => plaza.id) },
    eventStage: 'operations',
    duration: '20 min',
    steps: ['Confirme capacidade e acessibilidade.', 'Registre mapa, entradas e áreas de circulação.', 'Liste necessidades técnicas para o encontro.', 'Defina contato de referência no espaço.'],
    material: 'A lista serve como ponto de partida demonstrativo; adaptar ao local real.',
    version: 'demo-1',
    updatedAt: '2026-10-16',
    isDemo: true,
  },
  {
    id: 'campaign-starter',
    title: 'Monte uma divulgação clara',
    description: 'Organize a informação que a comunidade precisa para entender e compartilhar o encontro.',
    category: 'Marketing',
    topic: 'Divulgação',
    owner: 'Franquia + Marketing central',
    ownerPartnerIds: ['partner-franchise-demo', 'partner-marketing-demo', 'partner-franchise-demo-2', 'partner-marketing-demo-2'],
    scope: { visibility: 'plaza', plazaIds: DEMO_PLAZAS.map((plaza) => plaza.id) },
    eventStage: 'promotion',
    duration: '15 min',
    steps: ['Reúna data, local e proposta em uma frase.', 'Escolha o público e o canal prioritário.', 'Prepare chamada para ação e link oficial quando disponível.', 'Revise texto e leitura no celular antes de publicar.'],
    material: 'Crie o texto no gerador de briefing e escolha uma referência visual na Biblioteca de marketing.',
    version: 'demo-1',
    updatedAt: '2026-10-16',
    isDemo: true,
  },
  {
    id: 'run-of-show',
    title: 'Organize a sequência do dia',
    description: 'Registre os marcos principais para que a equipe local saiba o que acontece e quando.',
    category: 'Produção',
    topic: 'Dia do evento',
    owner: 'Produção local',
    ownerPartnerIds: ['partner-production-demo', 'partner-production-demo-2'],
    scope: { visibility: 'plaza', plazaIds: DEMO_PLAZAS.map((plaza) => plaza.id) },
    eventStage: 'event-day',
    duration: '25 min',
    steps: ['Anote chegada e passagem de som.', 'Marque abertura de portas e recepção.', 'Defina início, transições e encerramento.', 'Compartilhe a sequência com os responsáveis.'],
    material: 'Os horários nesta experiência são exemplos. Confirmar operação, contratos e equipe fora do protótipo.',
    version: 'demo-1',
    updatedAt: '2026-10-16',
    isDemo: true,
  },
  {
    id: 'sales-review',
    title: 'Leia os sinais da praça',
    description: 'Use o painel demonstrativo para conduzir uma conversa objetiva sobre a operação.',
    category: 'Vendas',
    topic: 'Leitura comercial',
    owner: 'Franquia',
    ownerPartnerIds: ['partner-franchise-demo', 'partner-franchise-demo-2'],
    scope: { visibility: 'plaza', plazaIds: DEMO_PLAZAS.map((plaza) => plaza.id) },
    eventStage: 'review',
    duration: '10 min',
    steps: ['Confira o score fictício e os sinais que o compõem.', 'Observe a tendência sem tratá-la como meta oficial.', 'Escolha uma ação de acompanhamento.', 'Registre dúvidas para validação com a equipe central.'],
    material: 'Os pesos e faixas atuais servem somente à demonstração e precisam de aprovação do negócio.',
    version: 'demo-1',
    updatedAt: '2026-10-16',
    isDemo: true,
  },
];

const GENERIC_CANVA_URL = 'https://www.canva.com/templates/';
const BRAND_KIT_BASE = 'https://tranquilomusica.com.br/media/';

export const MARKETING_TEMPLATES: MarketingTemplate[] = [
  {
    id: 'story-save-date',
    title: 'Save the date',
    channel: 'Stories',
    format: '1080 × 1920 · vertical',
    description: 'Prévia demonstrativa para anunciar a data do encontro.',
    accent: '#8792ff',
    copy: 'A gente se encontra\n[DATA] · [CIDADE]',
    resourceUrl: GENERIC_CANVA_URL,
    resourceLabel: 'Abrir modelos gerais no Canva',
  },
  {
    id: 'feed-event',
    title: 'Convite para o encontro',
    channel: 'Feed',
    format: '1080 × 1350 · retrato',
    description: 'Prévia demonstrativa com espaço para proposta, data e local.',
    accent: '#f5c4d2',
    copy: 'MÚSICA AO VIVO\n[ARTISTA / PROPOSTA]\n[CIDADE] · [DATA]',
    resourceUrl: GENERIC_CANVA_URL,
    resourceLabel: 'Abrir modelos gerais no Canva',
  },
  {
    id: 'whatsapp-invite',
    title: 'Convite para compartilhar',
    channel: 'WhatsApp',
    format: 'Texto + imagem · horizontal',
    description: 'Estrutura curta de convite para compartilhar com a comunidade.',
    accent: '#b5dfb2',
    copy: 'Tem encontro chegando.\n[DATA] · [LOCAL]\nVem com a gente.',
    resourceUrl: GENERIC_CANVA_URL,
    resourceLabel: 'Abrir modelos gerais no Canva',
  },
  {
    id: 'story-after',
    title: 'Obrigado por chegar junto',
    channel: 'Stories',
    format: '1080 × 1920 · vertical',
    description: 'Prévia demonstrativa para agradecer a presença após o encontro.',
    accent: '#ffc14e',
    copy: 'QUE BOM TER VOCÊ\nPOR AQUI.\nAté o próximo encontro.',
    resourceUrl: GENERIC_CANVA_URL,
    resourceLabel: 'Abrir modelos gerais no Canva',
  },
  {
    id: 'official-kit-portrait',
    title: 'Kit de marca · vertical',
    channel: 'Kit oficial',
    format: 'A4 · orientação vertical',
    description: 'Arquivo público disponibilizado na página Kit de Marca do Tranquilo.',
    accent: '#eeeeee',
    copy: 'TRANQUILO.\nMaterial oficial\nA4 · vertical',
    resourceUrl: `${BRAND_KIT_BASE}brand-a4-portrait.png`,
    resourceLabel: 'Baixar arquivo oficial',
    official: true,
  },
  {
    id: 'official-kit-landscape',
    title: 'Kit de marca · horizontal',
    channel: 'Kit oficial',
    format: 'A4 · orientação horizontal',
    description: 'Arquivo público disponibilizado na página Kit de Marca do Tranquilo.',
    accent: '#d9e3ff',
    copy: 'TRANQUILO. · Material oficial · A4',
    resourceUrl: `${BRAND_KIT_BASE}brand-a4-landscape.png`,
    resourceLabel: 'Baixar arquivo oficial',
    official: true,
  },
];

export const DEMO_ARTISTS = [
  { id: 'artist-tbd-demo', displayName: 'Artista a confirmar · exemplo', isDemo: true as const },
  { id: 'artist-placeholder-demo', displayName: 'Artista de exemplo · sem contratação', isDemo: true as const },
];

export const DEMO_CAMPAIGNS = [
  { id: 'campaign-invite-demo', title: 'Convite para a comunidade · demo', templateIds: ['story-save-date', 'feed-event', 'whatsapp-invite'], isDemo: true as const },
  { id: 'campaign-reminder-demo', title: 'Lembrete de data · demo', templateIds: ['story-save-date', 'whatsapp-invite'], isDemo: true as const },
  { id: 'campaign-thanks-demo', title: 'Agradecimento após o encontro · demo', templateIds: ['story-after'], isDemo: true as const },
];

export const SALES_DEMO: SalesSnapshot = {
  plazaId: DEMO_PLAZA.id,
  source: { kind: 'demo', label: 'Amostra fictícia do protótipo' },
  updatedAt: '2026-10-16T00:00:00.000Z',
  importStatus: 'demo',
  missingFields: [],
  score: 75,
  band: 'Atenção',
  updatedLabel: 'Atualização fictícia · 16 out',
  metrics: [
    { id: 'sell-through', label: 'Ritmo de ingressos', value: 68, weight: 40, note: 'Percentual simulado de referência.' },
    { id: 'campaign', label: 'Aderência da divulgação', value: 82, weight: 20, note: 'Sinal fictício de campanha.' },
    { id: 'readiness', label: 'Checklist da operação', value: 75, weight: 25, note: 'Exemplo de preparação.' },
    { id: 'attendance', label: 'Presença estimada', value: 81, weight: 15, note: 'Valor hipotético.' },
  ],
  trend: [42, 54, 49, 63, 59, 75],
};

export const SALES_DEMO_SNAPSHOTS: SalesSnapshot[] = [
  SALES_DEMO,
  {
    ...SALES_DEMO,
    plazaId: DEMO_PLAZA_ALT.id,
    source: { kind: 'demo', label: 'Amostra fictícia · praça exemplo 02' },
    score: 64,
    band: 'Apoio',
    metrics: SALES_DEMO.metrics.map((metric) => ({ ...metric, value: Math.max(0, metric.value === null ? 0 : metric.value - 11) })),
    trend: [34, 46, 44, 52, 57, 64],
  },
];

export const INITIAL_BRIEFING: BriefingDraft = {
  plazaId: DEMO_PLAZA.id,
  eventId: DEMO_EVENT.id,
  artistId: 'artist-tbd-demo',
  campaignId: 'campaign-invite-demo',
  eventName: 'Encontro de novembro · edição demonstrativa',
  city: 'São Paulo',
  venue: DEMO_EVENT.venue,
  format: DEMO_EVENT.format,
  date: '2026-11-21',
  objective: 'Convidar a comunidade local para uma experiência de música ao vivo.',
  audience: 'Pessoas da comunidade local que gostam de música ao vivo.',
  channel: 'Instagram',
  keyMessage: 'Música ao vivo. Curadoria. Encontros que viram casa.',
  callToAction: 'Confira as informações oficiais do encontro.',
  tone: 'Próximo e acolhedor · exemplo',
};
