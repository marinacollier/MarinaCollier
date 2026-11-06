/**
 * TEST FIXTURE ONLY — the trip records as they stand on her device after the operational update of 06/11
 * (commit 5319bbf, `seed/update-1106`). That migration is not part of the app anymore (her records already
 * carry it, same ids), so tests reproduce the relevant fields here: the caiaque moved to Monday 09/11
 * 13:00–15:00 (AGUARDANDO RESPOSTA, saída antecipada da aula) and the Garden Route out of the week as
 * OPCIONAL without a date. Never imported by app code.
 */
import type { DB, TripItem } from '../types'

const ZA = 'seed:travel:za-'

export const CAIAQUE_1106: Partial<TripItem> = {
  section: 'reserva',
  group: 'Cape Town',
  title: 'Caiaque com focas — Hout Bay (Kayak Adventures)',
  status: 'a_confirmar',
  optional: false,
  date: '2026-11-09',
  time: '13:00',
  endTime: '15:00',
  schoolImpact: 'parcial',
  certainty: 'pendente',
  bookingStatus: 'aguardando_resposta',
  supplier: 'Kayak Adventures',
  currency: 'ZAR',
  category: 'tours',
  priority: 'P1',
  nextAction: 'Aguardar a confirmação do grupo mínimo',
  caveat: 'Operador exige mínimo de 4 participantes; grupo ainda não confirmado. Preço a confirmar',
  planB: 'Quinta 12/11 às 15h — alternativa ainda não garantida (choca com Robben Island)',
  notes: '06/11: Escola de manhã, saída antecipada para Hout Bay.',
}

const OUT: Partial<TripItem> = { optional: true, bookingStatus: 'opcional', status: 'a_confirmar', date: undefined, endDate: undefined, time: undefined, endTime: undefined, schoolImpact: undefined }
const OUT_OF_WEEK = ['garden-route-1', 'garden-route-hosp', 'tsitsikamma', 'garden-route-volta', 'bloukrans'].map((s) => ZA + s)

export function apply1106(db: DB): DB {
  return {
    ...db,
    tripItems: db.tripItems.map((i) => {
      if (i.id === `${ZA}caiaque`) return { ...i, ...CAIAQUE_1106 }
      if (OUT_OF_WEEK.includes(i.id)) return { ...i, ...OUT }
      return i
    }),
  }
}
