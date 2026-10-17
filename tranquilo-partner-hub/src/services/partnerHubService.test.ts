import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_EVENTS, DEMO_PARTNERS, DEMO_PLAZAS, INITIAL_BRIEFING, INITIAL_PREP_STATE, PLAYBOOKS, PREP_TASKS, SALES_DEMO, SALES_DEMO_SNAPSHOTS } from '../mocks/demoData';
import { getDashboardSalesIndicators, getPrepProgress, getWeightedSalesScore, partnerHubService } from './partnerHubService';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: new MemoryStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('estado compartilhado do evento demonstrativo', () => {
  it('deriva dashboard, praça e briefing do mesmo estado salvo', () => {
    const edited = {
      ...INITIAL_PREP_STATE,
      title: 'Noite de teste da praça',
      city: 'Recife',
      date: '2027-03-14',
      venue: 'Casa do Bairro',
      format: 'Show intimista',
      objective: 'Reunir a comunidade local',
      audience: 'Pessoas da região',
      channels: ['WhatsApp'],
      notes: 'Acessibilidade deve ser mencionada',
    };

    expect(partnerHubService.saveEventPrep(edited)).toMatchObject({ ok: true, data: edited });
    const loaded = partnerHubService.getEventPrep();
    expect(loaded.ok).toBe(true);

    const event = partnerHubService.getEventFromPrep(loaded.data);
    const plaza = partnerHubService.getPlazaFromPrep(loaded.data);
    const briefing = partnerHubService.getBriefingContextFromEvent(loaded.data);

    expect(event).toMatchObject({ title: 'Noite de teste da praça', city: 'Recife', date: '2027-03-14', venue: 'Casa do Bairro', format: 'Show intimista' });
    expect(event).toMatchObject({ id: INITIAL_PREP_STATE.eventId, plazaId: INITIAL_PREP_STATE.plazaId });
    expect(plaza).toMatchObject({ id: INITIAL_PREP_STATE.plazaId, name: 'São Paulo', isDemo: true });
    expect(briefing).toMatchObject({ eventName: event.title, city: event.city, venue: event.venue, format: event.format, date: event.date, objective: edited.objective, audience: edited.audience, channel: 'WhatsApp', keyMessage: edited.notes });
  });

  it('normaliza uma gravação antiga ou incompleta sem quebrar a jornada', () => {
    window.localStorage.setItem('tranquilo-hub-demo:event-prep-v1', JSON.stringify({ city: 'São Paulo', title: 42, activeStep: 99, channels: ['Instagram', 3], checkedTaskIds: ['venue-check', null] }));

    const loaded = partnerHubService.getEventPrep();
    expect(loaded.data).toMatchObject({
      eventId: INITIAL_PREP_STATE.eventId,
      plazaId: INITIAL_PREP_STATE.plazaId,
      city: 'São Paulo',
      title: INITIAL_PREP_STATE.title,
      activeStep: 3,
      channels: ['Instagram'],
      checkedTaskIds: ['venue-check'],
    });
    expect(partnerHubService.getEventFromPrep(loaded.data).city).toBe('São Paulo');
  });

  it('relaciona fixtures por IDs e marca fonte e metadados como demonstração', () => {
    const plazaIds = new Set(DEMO_PLAZAS.map((plaza) => plaza.id));
    const partnerIds = new Set(DEMO_PARTNERS.map((partner) => partner.id));
    const eventIds = new Set(DEMO_EVENTS.map((event) => event.id));

    expect(DEMO_EVENTS.every((event) => plazaIds.has(event.plazaId) && event.partnerIds.every((id) => partnerIds.has(id)) && event.isDemo)).toBe(true);
    expect(PREP_TASKS.every((task) => eventIds.has(task.eventId) && plazaIds.has(task.plazaId) && task.responsiblePartnerIds.every((id) => partnerIds.has(id)) && task.isDemo)).toBe(true);
    expect(PLAYBOOKS.every((item) => item.scope.plazaIds.every((id) => plazaIds.has(id)) && item.version && item.updatedAt && item.isDemo)).toBe(true);
    expect(SALES_DEMO).toMatchObject({ source: { kind: 'demo' }, importStatus: 'demo', plazaId: INITIAL_PREP_STATE.plazaId, missingFields: [] });
    expect(getWeightedSalesScore(SALES_DEMO.metrics)).toBe(75);
    expect(SALES_DEMO_SNAPSHOTS.every((snapshot) => getWeightedSalesScore(snapshot.metrics) === snapshot.score)).toBe(true);
    expect(getWeightedSalesScore([{ value: null, weight: 100 }])).toBeNull();
    expect(partnerHubService.getContent()).toMatchObject({ plazas: DEMO_PLAZAS, events: DEMO_EVENTS, partners: DEMO_PARTNERS });
  });

  it('alinha indicadores e briefing direto ao evento da praça ativa', () => {
    const primary = getDashboardSalesIndicators(SALES_DEMO_SNAPSHOTS[0]);
    const alternate = getDashboardSalesIndicators(SALES_DEMO_SNAPSHOTS[1]);
    expect(primary).toMatchObject({ sellThrough: { value: 68 }, attendance: { value: 81 }, score: 75 });
    expect(alternate).toMatchObject({ sellThrough: { value: 57 }, attendance: { value: 70 }, score: 64 });

    const secondEventId = DEMO_EVENTS[1].id;
    partnerHubService.setActiveEventId(secondEventId);
    expect(partnerHubService.getBriefingContextFromEvent()).toMatchObject({
      eventId: secondEventId,
      plazaId: DEMO_EVENTS[1].plazaId,
      eventName: DEMO_EVENTS[1].title,
      city: DEMO_EVENTS[1].city,
      venue: DEMO_EVENTS[1].venue,
      format: DEMO_EVENTS[1].format,
    });
  });

  it('isola checklist, progresso e praça por evento ao alternar entre demonstrações', () => {
    const secondEventId = DEMO_EVENTS[1].id;
    const initialSecond = partnerHubService.getEventPrep(secondEventId).data;
    expect(getPrepProgress(initialSecond)).toBe(0);
    expect(partnerHubService.getPlazaFromPrep(initialSecond)).toMatchObject({ id: 'demo-plaza-02', name: 'Praça Exemplo 02' });

    const changedSecond = { ...initialSecond, title: 'Revisão isolada do encontro 02', checkedTaskIds: ['venue-check-event-002'] };
    expect(partnerHubService.saveEventPrep(changedSecond).ok).toBe(true);
    expect(partnerHubService.getEventPrep(secondEventId).data).toMatchObject(changedSecond);
    expect(getPrepProgress(partnerHubService.getEventPrep(secondEventId).data)).toBe(20);

    const first = partnerHubService.getEventPrep().data;
    expect(first).toMatchObject({ title: INITIAL_PREP_STATE.title, checkedTaskIds: INITIAL_PREP_STATE.checkedTaskIds });
    expect(getPrepProgress(first)).toBe(20);
    expect(partnerHubService.setActiveEventId(secondEventId)).toMatchObject({ ok: true, data: secondEventId });
    expect(partnerHubService.getActiveEventId()).toMatchObject({ ok: true, data: secondEventId });
  });

  it('recupera IDs relacionais no briefing e mantém revisão/aprovação apenas local', () => {
    const secondEvent = partnerHubService.getEventPrep(DEMO_EVENTS[1].id).data;
    const context = partnerHubService.getBriefingContextFromEvent(secondEvent);
    expect(context).toMatchObject({ plazaId: secondEvent.plazaId, eventId: secondEvent.eventId, eventName: secondEvent.title });

    const saved = partnerHubService.saveBriefing({ ...INITIAL_BRIEFING, ...context }, '**Rascunho original**');
    expect(saved.data[0]).toMatchObject({ status: 'draft', content: '**Rascunho original**', draft: { plazaId: secondEvent.plazaId, eventId: secondEvent.eventId } });
    const id = saved.data[0].id;
    const editedContent = '**Texto revisado pelo franqueado**';
    expect(partnerHubService.updateBriefingContent(id, editedContent).data[0].content).toBe(editedContent);
    expect(partnerHubService.updateBriefingStatus(id, 'in_review').data[0].status).toBe('in_review');
    expect(partnerHubService.updateBriefingStatus(id, 'approved_demo').data[0].status).toBe('approved_demo');
    expect(partnerHubService.getBriefings().data[0]).toMatchObject({ status: 'approved_demo', content: editedContent });
    expect(partnerHubService.updateBriefingStatus('not-saved', 'in_review').ok).toBe(false);
  });
});
