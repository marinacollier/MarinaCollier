import { usePartnerHub } from '../App';
import { useToast } from './ui';

export function DemoEventSelector() {
  const { activeEventId, events, plazas, selectActiveEvent } = usePartnerHub();
  const { showToast } = useToast();

  const handleChange = (eventId: string) => {
    const result = selectActiveEvent(eventId);
    if (!result.ok) showToast(result.message, 'error');
  };

  return (
    <label className="demo-event-selector">
      <span>EVENTO ATIVO · DEMONSTRAÇÃO</span>
      <select aria-label="Selecionar evento demonstrativo" value={activeEventId} onChange={(event) => handleChange(event.target.value)}>
        {events.map((event) => {
          const plaza = plazas.find((item) => item.id === event.plazaId);
          return <option key={event.id} value={event.id}>{plaza?.name ?? 'Praça demonstrativa'} · {event.title}</option>;
        })}
      </select>
    </label>
  );
}
