import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ToastProvider } from './components/ui';
import { BriefingPage } from './pages/BriefingPage';
import { DashboardPage } from './pages/DashboardPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { MarketingPage } from './pages/MarketingPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { PrepareEventPage } from './pages/PrepareEventPage';
import { SalesPage } from './pages/SalesPage';
import { partnerHubService, type PartnerHubContent } from './services/partnerHubService';
import type { EventPrepState, ServiceResult } from './types';

interface PartnerHubContextValue extends PartnerHubContent {
  activeEventId: string;
  eventPrep: EventPrepState;
  saveEventPrep: (state: EventPrepState) => ServiceResult<EventPrepState>;
  selectActiveEvent: (eventId: string) => ServiceResult<EventPrepState>;
}

const PartnerHubContext = createContext<PartnerHubContextValue | null>(null);

export function usePartnerHub(): PartnerHubContextValue {
  const value = useContext(PartnerHubContext);
  if (!value) throw new Error('usePartnerHub precisa estar dentro do Partner Hub.');
  return value;
}

function PartnerHubProvider({ children }: { children: ReactNode }) {
  const [baseContent] = useState(() => partnerHubService.getContent());
  const [activeEventId, setActiveEventId] = useState(() => partnerHubService.getActiveEventId().data);
  const [eventPrep, setEventPrep] = useState(() => partnerHubService.getEventPrep(activeEventId).data);

  const saveEventPrep = useCallback((state: EventPrepState) => {
    const result = partnerHubService.saveEventPrep(state);
    setEventPrep(result.data);
    return result;
  }, []);

  const selectActiveEvent = useCallback((eventId: string) => {
    const activeResult = partnerHubService.setActiveEventId(eventId);
    const loaded = partnerHubService.getEventPrep(eventId);
    setActiveEventId(eventId);
    setEventPrep(loaded.data);
    if (!activeResult.ok) return { ok: false as const, data: loaded.data, message: activeResult.message };
    if (!loaded.ok) return { ok: false as const, data: loaded.data, message: loaded.message };
    return { ok: true as const, data: loaded.data };
  }, []);

  const content = useMemo<PartnerHubContextValue>(() => {
    const plaza = partnerHubService.getPlazaFromPrep(eventPrep);
    const event = partnerHubService.getEventFromPrep(eventPrep);
    const salesDemo = baseContent.salesSnapshots.find((snapshot) => snapshot.plazaId === plaza.id) ?? baseContent.salesDemo;
    return {
      ...baseContent,
      plaza,
      event,
      prepTasks: baseContent.prepTasks.filter((task) => task.eventId === eventPrep.eventId),
      salesDemo,
      activeEventId,
      eventPrep,
      saveEventPrep,
      selectActiveEvent,
    };
  }, [activeEventId, baseContent, eventPrep, saveEventPrep, selectActiveEvent]);

  return <PartnerHubContext.Provider value={content}>{children}</PartnerHubContext.Provider>;
}

export default function App() {
  return (
    <ToastProvider>
      <PartnerHubProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="eventos/preparar" element={<PrepareEventPage />} />
            <Route path="conhecimento" element={<KnowledgePage />} />
            <Route path="marketing" element={<MarketingPage />} />
            <Route path="vendas" element={<SalesPage />} />
            <Route path="briefings" element={<BriefingPage />} />
            <Route path="oportunidades" element={<OpportunitiesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </PartnerHubProvider>
    </ToastProvider>
  );
}
