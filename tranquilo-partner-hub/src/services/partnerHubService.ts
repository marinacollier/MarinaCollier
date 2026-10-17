import {
  DEMO_EVENT,
  DEMO_EVENTS,
  DEMO_ARTISTS,
  DEMO_CAMPAIGNS,
  DEMO_NOTICE,
  DEMO_PARTNERS,
  DEMO_PLAZA,
  DEMO_PLAZAS,
  INITIAL_BRIEFING,
  INITIAL_PREP_STATE,
  INITIAL_PREP_STATES,
  MARKETING_TEMPLATES,
  PLAYBOOKS,
  PREP_TASKS,
  SALES_DEMO,
  SALES_DEMO_SNAPSHOTS,
} from '../mocks/demoData';
import type {
  BriefingDraft,
  BriefingStatus,
  DemoArtist,
  DemoCampaign,
  DemoEvent,
  EventPrepState,
  MarketingTemplate,
  Partner,
  Plaza,
  Playbook,
  PrepTask,
  SavedBriefing,
  SalesSnapshot,
  ServiceResult,
} from '../types';

const PREFIX = 'tranquilo-hub-demo:';
const KEYS = {
  prepByEvent: `${PREFIX}event-preps-v2`,
  legacyPrep: `${PREFIX}event-prep-v1`,
  activeEvent: `${PREFIX}active-event-v1`,
  playbookChecks: `${PREFIX}playbook-checks-v1`,
  briefings: `${PREFIX}briefings-v1`,
};

type PlaybookChecks = Record<string, string[]>;
type EventPrepMap = Record<string, EventPrepState>;

export interface PartnerHubContent {
  demoNotice: string;
  plaza: Plaza;
  plazas: Plaza[];
  event: DemoEvent;
  events: DemoEvent[];
  partners: Partner[];
  prepTasks: PrepTask[];
  playbooks: Playbook[];
  templates: MarketingTemplate[];
  salesDemo: typeof SALES_DEMO;
  salesSnapshots: SalesSnapshot[];
  artists: DemoArtist[];
  campaigns: DemoCampaign[];
  initialPrep: EventPrepState;
  initialBriefing: BriefingDraft;
}

export interface PartnerHubService {
  getContent(): PartnerHubContent;
  getEventPrep(eventId?: string): ServiceResult<EventPrepState>;
  getEventPreps(): ServiceResult<EventPrepMap>;
  getActiveEventId(): ServiceResult<string>;
  setActiveEventId(eventId: string): ServiceResult<string>;
  getEventFromPrep(state: EventPrepState): DemoEvent;
  getPlazaFromPrep(state: EventPrepState): Plaza;
  getBriefingContextFromEvent(state?: EventPrepState): BriefingDraft;
  saveEventPrep(state: EventPrepState): ServiceResult<EventPrepState>;
  getPlaybookChecks(): ServiceResult<PlaybookChecks>;
  savePlaybookChecks(value: PlaybookChecks): ServiceResult<PlaybookChecks>;
  getBriefings(): ServiceResult<SavedBriefing[]>;
  saveBriefing(draft: BriefingDraft, content: string): ServiceResult<SavedBriefing[]>;
  updateBriefingContent(id: string, content: string): ServiceResult<SavedBriefing[]>;
  updateBriefingStatus(id: string, status: BriefingStatus): ServiceResult<SavedBriefing[]>;
}

function readLocal<T>(key: string, fallback: T): ServiceResult<T> {
  try {
    if (typeof window === 'undefined') return { ok: true, data: fallback };
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ok: true, data: fallback };
    return { ok: true, data: JSON.parse(raw) as T };
  } catch {
    return {
      ok: false,
      data: fallback,
      message: 'Não foi possível ler o estado salvo neste navegador. A tela seguirá com os dados demonstrativos iniciais.',
    };
  }
}

function writeLocal<T>(key: string, value: T): ServiceResult<T> {
  try {
    if (typeof window === 'undefined') return { ok: true, data: value };
    window.localStorage.setItem(key, JSON.stringify(value));
    return { ok: true, data: value };
  } catch {
    return {
      ok: false,
      data: value,
      message: 'O navegador não permitiu salvar a alteração. Ela segue visível até você sair desta tela.',
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isKnownEvent(eventId: unknown): eventId is string {
  return typeof eventId === 'string' && DEMO_EVENTS.some((event) => event.id === eventId);
}

function initialStateFor(eventId: string): EventPrepState {
  return INITIAL_PREP_STATES[eventId] ?? INITIAL_PREP_STATE;
}

function normalizeEventPrep(value: unknown, fallbackEventId = DEMO_EVENT.id): EventPrepState {
  const saved = isRecord(value) ? value as Partial<EventPrepState> : {};
  const eventId = isKnownEvent(saved.eventId) ? saved.eventId : fallbackEventId;
  const fallback = initialStateFor(eventId);
  const activeStep = typeof saved.activeStep === 'number' && Number.isInteger(saved.activeStep)
    ? Math.max(0, Math.min(3, saved.activeStep))
    : fallback.activeStep;

  return {
    ...fallback,
    ...saved,
    eventId,
    plazaId: typeof saved.plazaId === 'string' ? saved.plazaId : fallback.plazaId,
    city: typeof saved.city === 'string' ? saved.city : fallback.city,
    title: typeof saved.title === 'string' ? saved.title : fallback.title,
    date: typeof saved.date === 'string' ? saved.date : fallback.date,
    venue: typeof saved.venue === 'string' ? saved.venue : fallback.venue,
    format: typeof saved.format === 'string' ? saved.format : fallback.format,
    objective: typeof saved.objective === 'string' ? saved.objective : fallback.objective,
    audience: typeof saved.audience === 'string' ? saved.audience : fallback.audience,
    channels: Array.isArray(saved.channels) ? saved.channels.filter((item): item is string => typeof item === 'string') : fallback.channels,
    notes: typeof saved.notes === 'string' ? saved.notes : fallback.notes,
    checkedTaskIds: Array.isArray(saved.checkedTaskIds) ? saved.checkedTaskIds.filter((item): item is string => typeof item === 'string') : fallback.checkedTaskIds,
    activeStep,
  };
}

function normalizePrepMap(value: unknown): EventPrepMap | null {
  if (!isRecord(value)) return null;
  if ('eventId' in value || 'title' in value || 'checkedTaskIds' in value) {
    const legacy = normalizeEventPrep(value);
    return { [legacy.eventId]: legacy };
  }

  const result: EventPrepMap = {};
  for (const [eventId, state] of Object.entries(value)) {
    if (!isKnownEvent(eventId) || !isRecord(state)) continue;
    result[eventId] = normalizeEventPrep({ ...state, eventId }, eventId);
  }
  return Object.keys(result).length ? result : null;
}

function readEventPrepMap(): ServiceResult<EventPrepMap> {
  const initial: EventPrepMap = { ...INITIAL_PREP_STATES };
  const current = readLocal<unknown>(KEYS.prepByEvent, null);
  const parsedCurrent = current.ok ? normalizePrepMap(current.data) : null;
  if (parsedCurrent) return { ok: true, data: { ...initial, ...parsedCurrent } };

  const legacy = readLocal<unknown>(KEYS.legacyPrep, null);
  const parsedLegacy = legacy.ok ? normalizePrepMap(legacy.data) : null;
  if (parsedLegacy) return { ok: true, data: { ...initial, ...parsedLegacy } };
  if (!current.ok || !legacy.ok) {
    return {
      ok: false,
      data: initial,
      message: !current.ok ? current.message : !legacy.ok ? legacy.message : 'Não foi possível migrar a preparação antiga.',
    };
  }
  return { ok: true, data: initial };
}

function contextFromPrep(prep: EventPrepState): BriefingDraft {
  return {
    ...INITIAL_BRIEFING,
    plazaId: prep.plazaId,
    eventId: prep.eventId,
    eventName: prep.title.trim() || 'Encontro demonstrativo',
    city: prep.city.trim() || 'A definir',
    venue: prep.venue.trim() || 'A definir',
    format: prep.format.trim() || 'A definir',
    date: prep.date,
    objective: prep.objective.trim(),
    audience: prep.audience.trim(),
    channel: prep.channels[0] ?? '',
    keyMessage: prep.notes.trim(),
    callToAction: 'Definir e conferir as informações oficiais antes de publicar.',
  };
}

const initialPlaybookChecks: PlaybookChecks = Object.fromEntries(
  PLAYBOOKS.map((playbook) => [playbook.id, []]),
);

export const partnerHubService: PartnerHubService = {
  getContent: () => ({
    demoNotice: DEMO_NOTICE,
    plaza: DEMO_PLAZA,
    plazas: DEMO_PLAZAS,
    event: DEMO_EVENT,
    events: DEMO_EVENTS,
    partners: DEMO_PARTNERS,
    prepTasks: PREP_TASKS,
    playbooks: PLAYBOOKS,
    templates: MARKETING_TEMPLATES,
    salesDemo: SALES_DEMO,
    salesSnapshots: SALES_DEMO_SNAPSHOTS,
    artists: DEMO_ARTISTS,
    campaigns: DEMO_CAMPAIGNS,
    initialPrep: INITIAL_PREP_STATE,
    initialBriefing: INITIAL_BRIEFING,
  }),
  getEventPrep: (eventId = DEMO_EVENT.id) => {
    const result = readEventPrepMap();
    const data = result.data[eventId] ?? initialStateFor(eventId);
    return result.ok ? { ok: true, data } : { ok: false, data, message: result.message };
  },
  getEventPreps: readEventPrepMap,
  getActiveEventId: () => {
    const result = readLocal<string>(KEYS.activeEvent, DEMO_EVENT.id);
    const data = isKnownEvent(result.data) ? result.data : DEMO_EVENT.id;
    return result.ok ? { ok: true, data } : { ok: false, data, message: result.message };
  },
  setActiveEventId: (eventId) => {
    if (!isKnownEvent(eventId)) {
      return { ok: false, data: DEMO_EVENT.id, message: 'Este evento não está disponível nesta demonstração.' };
    }
    return writeLocal(KEYS.activeEvent, eventId);
  },
  getEventFromPrep: (state) => {
    const baseEvent = DEMO_EVENTS.find((event) => event.id === state.eventId) ?? DEMO_EVENT;
    return {
      ...baseEvent,
      id: state.eventId || baseEvent.id,
      plazaId: state.plazaId || baseEvent.plazaId,
      title: state.title.trim() || 'Encontro demonstrativo',
      date: state.date,
      venue: state.venue.trim() || 'A definir',
      format: state.format.trim() || 'A definir',
      city: state.city.trim() || 'A definir',
    };
  },
  getPlazaFromPrep: (state) => DEMO_PLAZAS.find((item) => item.id === state.plazaId) ?? DEMO_PLAZA,
  getBriefingContextFromEvent: (state) => {
    const activeEventId = partnerHubService.getActiveEventId().data;
    return contextFromPrep(state ?? partnerHubService.getEventPrep(activeEventId).data);
  },
  saveEventPrep: (state) => {
    const normalized = normalizeEventPrep(state, state.eventId);
    const current = readEventPrepMap();
    const next = { ...current.data, [normalized.eventId]: normalized };
    const result = writeLocal(KEYS.prepByEvent, next);
    return result.ok ? { ok: true, data: normalized } : { ok: false, data: normalized, message: result.message };
  },
  getPlaybookChecks: () => readLocal(KEYS.playbookChecks, initialPlaybookChecks),
  savePlaybookChecks: (value) => writeLocal(KEYS.playbookChecks, value),
  getBriefings: () => {
    const result = readLocal<unknown>(KEYS.briefings, []);
    const items = Array.isArray(result.data) ? result.data : [];
    const normalized = items.filter(isRecord).map((entry, index): SavedBriefing => {
      const draft = isRecord(entry.draft) ? entry.draft : {};
      const status = entry.status === 'in_review' || entry.status === 'approved_demo' ? entry.status : 'draft';
      const eventId = isKnownEvent(draft.eventId) ? draft.eventId : INITIAL_BRIEFING.eventId;
      const eventContext = contextFromPrep(partnerHubService.getEventPrep(eventId).data);
      return {
        id: typeof entry.id === 'string' ? entry.id : `briefing-legacy-${index}`,
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date(0).toISOString(),
        draft: {
          ...INITIAL_BRIEFING,
          ...eventContext,
          ...draft,
          eventId: eventContext.eventId,
          venue: typeof draft.venue === 'string' ? draft.venue : eventContext.venue,
          format: typeof draft.format === 'string' ? draft.format : eventContext.format,
        } as BriefingDraft,
        content: typeof entry.content === 'string' ? entry.content : '',
        status,
      };
    });
    return result.ok ? { ok: true, data: normalized } : { ok: false, data: normalized, message: result.message };
  },
  saveBriefing: (draft, content) => {
    const current = partnerHubService.getBriefings();
    const saved: SavedBriefing = {
      id: `briefing-${Date.now()}`,
      createdAt: new Date().toISOString(),
      draft,
      content,
      status: 'draft',
    };
    return writeLocal(KEYS.briefings, [saved, ...current.data].slice(0, 20));
  },
  updateBriefingContent: (id, content) => {
    const current = partnerHubService.getBriefings();
    const found = current.data.some((entry) => entry.id === id);
    if (!found) return { ok: false, data: current.data, message: 'Este rascunho não está mais salvo neste navegador.' };
    return writeLocal(KEYS.briefings, current.data.map((entry) => entry.id === id ? { ...entry, content } : entry));
  },
  updateBriefingStatus: (id, status) => {
    const current = partnerHubService.getBriefings();
    const found = current.data.some((entry) => entry.id === id);
    if (!found) return { ok: false, data: current.data, message: 'Este rascunho não está mais salvo neste navegador.' };
    return writeLocal(KEYS.briefings, current.data.map((entry) => entry.id === id ? { ...entry, status } : entry));
  },
};

export function getPrepProgress(state: EventPrepState, eventTasks?: PrepTask[]): number {
  const tasks = eventTasks ?? PREP_TASKS.filter((task) => task.eventId === state.eventId);
  if (tasks.length === 0) return 0;
  const completed = tasks.filter((task) => state.checkedTaskIds.includes(task.id)).length;
  return Math.round((completed / tasks.length) * 100);
}

export function getWeightedSalesScore(metrics: Array<{ value: number | null; weight: number }>): number | null {
  if (metrics.length === 0 || metrics.some((metric) => metric.value === null)) return null;
  return Math.round(metrics.reduce((total, metric) => total + ((metric.value ?? 0) * metric.weight) / 100, 0));
}

export function getDashboardSalesIndicators(snapshot: SalesSnapshot) {
  return {
    sellThrough: snapshot.metrics.find((metric) => metric.id === 'sell-through') ?? null,
    attendance: snapshot.metrics.find((metric) => metric.id === 'attendance') ?? null,
    score: getWeightedSalesScore(snapshot.metrics),
  };
}
