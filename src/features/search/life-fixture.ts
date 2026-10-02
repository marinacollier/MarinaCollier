/**
 * Test-only DB shaped like Marina's real-life seed (presencial days, TotalPass-style check-in rule,
 * weekly template, cerâmica at night, CEO Review with a template, trips with sub-areas, project people).
 * Not imported by app code. Reference "today" is 2026-10-02 (a Friday). No money values.
 */
import type { CollectionKey, DateKey, DB, ItemOf, NewItem } from '@/data/types'
import { defaultCategories, emptyDB } from '@/data/defaults'

export const LIFE_TODAY: DateKey = '2026-10-02'

export function buildLifeFixture(): DB {
  const db = emptyDB()
  const iso = '2026-09-25T12:00:00.000Z'
  let seq = 0
  function add<K extends CollectionKey>(key: K, data: NewItem<K>): ItemOf<K> {
    const item = { ...data, id: data.id ?? `${key}-${++seq}`, createdAt: iso, updatedAt: iso } as unknown as ItemOf<K>
    ;(db[key] as ItemOf<K>[]).push(item)
    return item
  }

  db.financialCategories = defaultCategories(iso)
  db.profile = {
    ...db.profile,
    onboardedAt: iso,
    homeBase: 'São Paulo',
    rhythm: { wakeTime: '04:40', sleepTime: '22:00' },
    work: {
      start: '09:00',
      end: '18:00',
      location: 'Interlagos, São Paulo',
      days: { 0: 'off', 1: 'remoto', 2: 'presencial', 3: 'presencial', 4: 'remoto', 5: 'remoto', 6: 'off' },
      commuteBeforeMin: 60,
      commuteAfterMin: 60,
      presencialChecklist: ['Roupa', 'Notebook', 'Carregador', 'Garrafa', 'Itens de treino (se tiver treino)'],
    },
  }

  // Planning rules
  add('constraints', { id: 'c-checkin', name: 'TotalPass — 1 check-in/dia', kind: 'max_checkins_per_day', limit: 1, modalities: ['natacao', 'yoga', 'musculacao'], active: true, notes: 'Natação + yoga no mesmo dia não rola.' })
  add('constraints', { id: 'c-yoga-app', name: 'Yoga App — até 1h/dia', kind: 'max_minutes_per_day', limit: 60, projectId: 'p-yoga', active: true })

  const tpl = (data: Omit<NewItem<'weekTemplate'>, 'order' | 'active'>) => add('weekTemplate', { ...data, order: seq, active: true })
  tpl({ weekday: 1, modalities: ['corrida'], choice: 'fixed', planType: 'base' })
  tpl({ weekday: 3, modalities: ['natacao'], choice: 'fixed', time: '07:00', durationMin: 60, planType: 'base' })
  tpl({ weekday: 4, modalities: ['bike', 'corrida'], choice: 'one_of', planType: 'base', notes: 'Bike cedo ou corrida' })
  tpl({ weekday: 5, modalities: ['natacao'], choice: 'fixed', time: '07:00', durationMin: 60, planType: 'base' })
  tpl({ weekday: 6, modalities: ['circo', 'surf', 'bike', 'trail'], choice: 'optional', title: 'Fun day', planType: 'flexivel', notes: 'Escolha o que combina com seu sábado.' })
  tpl({ weekday: 0, modalities: [], choice: 'rest', title: 'Recovery', planType: 'base' })

  // Workouts — week of 28/9 (Mon) to 4/10 (Sun)
  add('workouts', { date: '2026-09-28', modality: 'corrida', status: 'feito', durationMin: 45, order: 0 })
  add('workouts', { date: '2026-09-30', modality: 'natacao', status: 'feito', time: '07:00', durationMin: 60, order: 0 })
  add('workouts', { date: '2026-10-01', modality: 'bike', status: 'feito', time: '05:30', durationMin: 75, order: 0 })
  add('workouts', { id: 'w-swim-fri', date: '2026-10-02', modality: 'natacao', status: 'planejado', time: '07:00', plannedDurationMin: 60, planType: 'base', order: 0 })
  add('workouts', { id: 'w-gym-fri', date: '2026-10-02', modality: 'musculacao', status: 'planejado', time: '18:30', plannedDurationMin: 60, order: 1 })
  add('workouts', { id: 'w-circo', date: '2026-10-03', modality: 'circo', status: 'planejado', period: 'manha', planType: 'flexivel', order: 0 })
  add('workouts', { date: '2026-10-04', modality: 'recuperacao', status: 'descanso', order: 0 })
  // Next Tuesday (presencial): an early swim
  add('workouts', { date: '2026-10-06', modality: 'corrida', status: 'planejado', time: '06:00', plannedDurationMin: 45, order: 0 })

  add('workoutGoals', { id: 'wg-yoga', title: 'Yoga — 1x/semana', kind: 'habit', modality: 'yoga', startDate: '2026-09-01', milestones: [], status: 'ativa', planType: 'flexivel', perWeek: 1, preferredWeekdays: [4] })
  add('workoutGoals', { id: 'wg-circo', title: 'Circo / aéreos', kind: 'habit', modality: 'circo', startDate: '2026-09-01', milestones: [], status: 'ativa', planType: 'flexivel', perWeek: 1, obligation: false, preferredWeekdays: [6] })

  // Calendar
  add('calendarSources', { id: 'cal-local', provider: 'local', name: 'Marina OS', syncDirection: 'none', color: 'accent', enabled: true })
  add('events', { id: 'e-ceramica', sourceId: 'cal-local', title: 'Cerâmica', date: '2026-09-28', allDay: false, period: 'noite', kind: 'criatividade', category: 'Vida / Criatividade', planType: 'base', recurrence: { kind: 'weekly', weekdays: [1, 4] } })
  add('events', {
    id: 'e-ceo',
    sourceId: 'cal-local',
    title: 'Weekly CEO Review',
    date: '2026-09-05',
    startTime: '09:00',
    endTime: '10:00',
    allDay: false,
    kind: 'pessoal',
    planType: 'fixo',
    recurrence: { kind: 'weekly', weekdays: [6] },
    template: ['Principais wins', 'O que avançou', 'O que travou', 'Próximos movimentos', 'Prioridades da próxima semana'],
  })
  add('events', {
    id: 'e-board',
    sourceId: 'cal-local',
    title: 'Monthly Board Meeting',
    date: '2026-09-30',
    startTime: '20:00',
    endTime: '21:00',
    allDay: false,
    kind: 'pessoal',
    planType: 'fixo',
    recurrence: { kind: 'monthly', dayOfMonth: 'last' },
    template: ['Mês em retrospectiva', 'Carreira', 'Renda', 'Projetos', 'Decisões'],
  })

  // Work
  const proj = (id: string, name: string, emoji: string, extra: Partial<NewItem<'projects'>> = {}) =>
    add('projects', { id, name, emoji, tone: 'accent', status: 'ativo', priority: 'alta', links: [], files: [], people: [], decisions: [], changelog: [], kind: 'default', order: seq, ...extra })
  proj('p-ff', 'FashionFinder', '👗', { role: 'Produto + Tecnologia / CTPO', deadline: '2026-11-20', people: [{ name: 'Fran', role: 'sócia' }] })
  proj('p-dayone', 'Day One AI', '🤖', { sections: ['Planner', 'Match', 'Smart Flight', 'Consultant Copilot'] })
  proj('p-yoga', 'Yoga App', '🧘', { description: 'MVP funcional primeiro' })
  add('milestones', { projectId: 'p-ff', title: 'Postgres + sync', group: 'Infra / catálogo', status: 'roadmap', done: false, order: 0 })
  add('milestones', { projectId: 'p-ff', title: 'Embeddings', group: 'Busca', status: 'roadmap', done: false, order: 1 })
  add('tasks', { title: 'Retorno sobre o primeiro provider', status: 'waiting', projectId: 'p-ff', context: 'trabalho', waiting: { who: 'Fran', since: '2026-09-29' }, order: 0 })
  add('tasks', { title: 'Acesso ao painel', status: 'waiting', projectId: 'p-ff', context: 'trabalho', waiting: { who: 'time de dados', since: '2026-09-30' }, order: 1 })
  add('tasks', { title: 'Feedback da demo', status: 'waiting', projectId: 'p-dayone', context: 'trabalho', waiting: { who: 'Rafa', since: '2026-09-25' }, order: 2 })

  // Learning
  add('studyTracks', { id: 't-ingles', name: 'Inglês', emoji: '🇬🇧', tone: 'ocean', order: 0, archived: false, status: 'ativo', formats: ['Cambly', 'estudo individual', 'conversação', 'vocabulário'] })

  // Trips
  add('trips', { id: 'trip-recife', name: 'Recife', flag: '🇧🇷', place: 'Recife, PE', startDate: '2026-10-22', datesConfirmed: true, interests: [], tone: 'ocean', links: [], status: 'planejando', order: 0 })
  add('trips', { id: 'trip-za', name: 'África do Sul', flag: '🇿🇦', place: 'Cape Town', startDate: '2026-10-24', endDate: '2026-11-16', datesConfirmed: true, interests: ['surf', 'trail', 'safari', 'vinícolas'], tone: 'sand', links: [], status: 'planejando', order: 1 })
  add('trips', { id: 'trip-itacare', name: 'Réveillon — Itacaré', flag: '🌴', place: 'Itacaré, Bahia', datesConfirmed: false, dateLabel: 'fim de 2026', interests: [], tone: 'sage', links: [], status: 'sonhando', order: 2 })
  const item = (tripId: string, title: string, section: NewItem<'tripItems'>['section'], group?: string, extra: Partial<NewItem<'tripItems'>> = {}) =>
    add('tripItems', { tripId, title, section, group, status: 'a_confirmar', order: seq, ...extra })
  item('trip-recife', 'Voo', 'voo')
  item('trip-recife', 'Mala', 'mala')
  item('trip-za', 'Revisar voo', 'voo', 'Flights')
  item('trip-za', 'Voo internacional de volta', 'voo', 'Flights', { date: '2026-11-16', time: '10:00', notes: 'OR Tambo' })
  item('trip-za', 'Hospedagem Cape Town', 'hospedagem', 'Accommodation')
  item('trip-za', 'Hospedagem Johannesburg', 'hospedagem', 'Johannesburg')
  item('trip-za', 'Logística aeroporto', 'transporte', 'Johannesburg')
  item('trip-za', 'Safari', 'reserva', 'Safari', { date: '2026-11-14', endDate: '2026-11-15', paymentStatus: 'a_confirmar' })
  item('trip-za', 'Seguro', 'documento', 'Documents')
  item('trip-za', 'Long john', 'mala', 'Packing')
  item('trip-za', 'Bike rental', 'esporte', 'Gravel / Cycling', { status: 'confirmado' })
  add('tasks', { title: 'Lembrar do internet/eSIM', status: 'review', tripId: 'trip-za', group: 'Documents', context: 'viagem', order: 3 })

  // Routine with a short version
  add('routines', { id: 'r-manha', name: 'Milagre da manhã', period: 'manha', order: 0, active: true, hasEssential: true, essentialName: 'Essential', startTime: '04:40' })
  add('routineItems', { routineId: 'r-manha', title: 'Higiene da manhã', recurrence: { kind: 'daily' }, order: 0, active: true, steps: ['raspar língua', 'lavar rosto'], essential: true })

  return db
}
