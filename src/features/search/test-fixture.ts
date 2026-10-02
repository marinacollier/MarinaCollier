/**
 * Hand-made DB used by the search / Mari / command tests and for screenshots.
 * Not imported by app code. Dates are relative to `today` (tests use 2026-10-02, a Friday).
 * Money values here are test data only — never seed data.
 */
import type { CollectionKey, DateKey, DB, ItemOf, NewItem } from '@/data/types'
import { defaultCategories, emptyDB } from '@/data/defaults'
import { addDays } from '@/lib/date'

export const FIXTURE_TODAY: DateKey = '2026-10-02'

export function buildFixture(today: DateKey = FIXTURE_TODAY): DB {
  const db = emptyDB()
  const iso = (d: DateKey) => `${d}T12:00:00.000Z`
  const d = (n: number) => addDays(today, n)
  let seq = 0
  function add<K extends CollectionKey>(key: K, data: NewItem<K>, updated?: DateKey): ItemOf<K> {
    const item = { ...data, id: data.id ?? `${key}-${++seq}`, createdAt: iso(d(-30)), updatedAt: iso(updated ?? d(-1)) } as unknown as ItemOf<K>
    ;(db[key] as ItemOf<K>[]).push(item)
    return item
  }

  db.profile.onboardedAt = iso(d(-30))
  db.financialCategories = defaultCategories(iso(d(-60)))

  // Projects
  const proj = (id: string, name: string, emoji: string, extra: Partial<NewItem<'projects'>>, updated: DateKey) =>
    add(
      'projects',
      {
        id,
        name,
        emoji,
        tone: 'accent',
        status: 'ativo',
        priority: 'media',
        links: [],
        files: [],
        people: [],
        decisions: [],
        changelog: [],
        kind: 'default',
        order: seq,
        ...extra,
      },
      updated,
    )
  proj('proj-fashionfinder', 'FashionFinder', '👗', { nextAction: 'Revisar fluxo de onboarding', priority: 'alta', role: 'Product lead' }, d(-2))
  proj('proj-santander', 'Santander', '🏦', { nextAction: 'Fechar proposta do workshop' }, d(-3))
  proj('proj-dayone', 'DayOne', '🌅', { deadline: d(9), description: 'App de rotina matinal' }, d(-24))
  proj('proj-yoga', 'Yoga Studio', '🧘‍♀️', { status: 'pausado' }, d(-40))
  proj('proj-ugc', 'UGC & Conteúdo', '🎬', { kind: 'creator', nextAction: 'Gravar vídeo da rotina' }, d(-5))

  add('milestones', { projectId: 'proj-fashionfinder', title: 'Beta fechado do FashionFinder', date: d(18), done: false, order: 0 })
  add('wins', { date: d(-12), title: 'MVP do FashionFinder no ar', kind: 'entrega', projectId: 'proj-fashionfinder' })
  add('meetings', { title: 'Kickoff FashionFinder', date: d(-7), startTime: '10:00', projectId: 'proj-fashionfinder', decisions: ['Lançar beta em outubro'], actionItems: [], links: [] })

  // Tasks
  const task = (data: Partial<NewItem<'tasks'>> & { title: string }) => add('tasks', { status: 'todo', order: seq, ...data })
  task({ title: 'Feedback do time de dados', status: 'waiting', projectId: 'proj-fashionfinder', context: 'trabalho', waiting: { who: 'Ana', since: d(-10) } })
  task({ title: 'Assets do lookbook', status: 'waiting', projectId: 'proj-fashionfinder', context: 'trabalho', waiting: { who: 'time de design', since: d(-3) } })
  task({ title: 'Contrato assinado da academia', status: 'waiting', context: 'vida_real', waiting: { who: 'Smart Fit', since: d(-9) } })
  task({ title: 'Aprovar roteiro do workshop', projectId: 'proj-santander', context: 'trabalho', needsMe: true, priority: 'alta' })
  task({ title: 'Enviar proposta Santander', projectId: 'proj-santander', context: 'trabalho', dueDate: today, priority: 'alta' })
  task({ title: 'Reservar tour Cape Point', tripId: 'trip-africa', group: 'Cape Town', context: 'viagem', status: 'review' })
  task({ title: 'Comprar adaptador de tomada', tripId: 'trip-africa', context: 'viagem' })
  task({ title: 'Comprar ração da Luna', context: 'luna', date: d(1) })
  task({ title: 'Renovar CNH', context: 'vida_real', lifeAdminCategory: 'documentos', dueDate: d(12) })
  task({ title: 'Revisão da bike gravel', context: 'vida_real', lifeAdminCategory: 'bike' })
  task({ title: 'Ler briefing antigo', status: 'done', completedAt: iso(d(-20)), date: d(-20) })

  add('priorities', { date: today, title: 'Fechar proposta Santander', order: 0, done: false })
  add('priorities', { date: today, title: 'Treino de força', order: 1, done: true })

  add('workInbox', { source: 'outlook', subject: 'Aprovação do layout v2', sender: 'Bruno', kind: 'aprovacao', status: 'waiting', projectId: 'proj-fashionfinder' })
  add('workInbox', { source: 'teams', subject: 'Dúvida sobre métricas', sender: 'Carla', kind: 'responder', status: 'novo', projectId: 'proj-santander' })

  // Calendar
  add('events', { sourceId: 'cal-local', title: 'Daily FashionFinder', date: today, startTime: '09:00', endTime: '10:00', allDay: false, kind: 'trabalho' })
  add('events', { sourceId: 'cal-local', title: 'Workshop Santander', date: today, startTime: '14:00', endTime: '15:30', allDay: false, kind: 'trabalho', location: 'Faria Lima' })
  add('events', { sourceId: 'cal-local', title: 'Dentista', date: d(4), startTime: '08:00', endTime: '09:00', allDay: false, kind: 'saude' })

  // Body
  add('workouts', { date: d(-5), modality: 'gravel', status: 'feito', title: 'Gravel na represa', durationMin: 150, distanceKm: 52, order: 0 })
  add('workouts', { date: d(-4), modality: 'musculacao', status: 'feito', durationMin: 60, order: 0 })
  add('workouts', { date: d(-2), modality: 'trail', status: 'feito', title: 'Trail no Pico do Jaraguá', durationMin: 80, order: 0 })
  add('workouts', { date: d(1), modality: 'musculacao', status: 'planejado', time: '07:00', plannedDurationMin: 60, order: 0 })
  add('workouts', { date: d(2), modality: 'corrida', status: 'planejado', time: '07:00', plannedDurationMin: 60, order: 0 })

  // Money (test data)
  const exp = (title: string, cents: number, cat: string, date: DateKey, extra: Partial<NewItem<'expenses'>> = {}) =>
    add('expenses', { title, amountCents: cents, categoryId: cat, date, status: 'paid', origin: 'manual', ...extra })
  exp('Mercado do mês', 25000, 'cat-mercado', d(-22))
  exp('Passagem Recife', 120000, 'cat-viagem', d(-17), { tripId: 'trip-recife' })
  exp('Inscrição trail run', 18000, 'cat-esporte', d(-12))
  exp('Ração da Luna', 21000, 'cat-luna', d(-10))
  exp('Jantar com amigas', 8500, 'cat-restaurante', d(-3))
  exp('Câmara de ar da bike', 4500, 'cat-esporte', d(-2))
  exp('Feira', 14000, 'cat-mercado', d(-1))
  exp('Uber', 3200, 'cat-transporte', today)
  add('expenses', { title: 'Mochila de trilha', amountCents: 40000, categoryId: 'cat-esporte', status: 'planned_purchase', origin: 'manual' })

  // Learning
  add('studyTracks', { id: 'track-ia', name: 'IA', emoji: '🤖', tone: 'plum', order: 0, archived: false })
  add('studyTracks', { id: 'track-ingles', name: 'Inglês', emoji: '🇬🇧', tone: 'ocean', order: 1, archived: false })
  add('studyItems', { trackId: 'track-ia', title: 'Curso de LLMs aplicados', kind: 'curso', status: 'estudando', progress: 40, order: 0 })
  add('studyItems', { trackId: 'track-ia', title: 'Prompt engineering na prática', kind: 'curso', status: 'proximo', progress: 0, order: 1 })
  add('studyItems', { trackId: 'track-ingles', title: 'Business English', kind: 'curso', status: 'estudando', progress: 20, order: 0 })
  const book = (title: string, author: string, status: NewItem<'books'>['status'], order: number) =>
    add('books', { title, author, status, progress: status === 'lendo' ? 35 : status === 'finalizado' ? 100 : 0, quotes: [], order })
  book('Tudo é rio', 'Carla Madeira', 'lendo', 0)
  book('O poder do hábito', 'Charles Duhigg', 'proximo', 1)
  book('Pequenas coisas como estas', 'Claire Keegan', 'proximo', 2)
  book('Torto arado', 'Itamar Vieira Junior', 'quero', 3)
  book('Born to Run', 'Christopher McDougall', 'quero', 4)
  book('Mulheres que correm com os lobos', 'Clarissa Pinkola Estés', 'finalizado', 5)

  // Travel
  add('trips', { id: 'trip-recife', name: 'Recife', flag: '🇧🇷', place: 'Recife, PE', startDate: d(20), endDate: d(24), datesConfirmed: true, interests: ['praia'], tone: 'ocean', links: [], status: 'confirmada', order: 0 })
  add('trips', { id: 'trip-africa', name: 'África do Sul', flag: '🇿🇦', place: 'Cape Town + Kruger', startDate: d(39), endDate: d(53), datesConfirmed: false, dateLabel: 'novembro 2026', interests: ['safari', 'trilhas', 'vinhos'], tone: 'sand', links: [], status: 'planejando', order: 1 })
  const item = (tripId: string, title: string, section: NewItem<'tripItems'>['section'], status: NewItem<'tripItems'>['status'], group?: string) =>
    add('tripItems', { tripId, title, section, status, group, order: seq })
  item('trip-recife', 'Hotel em Boa Viagem', 'hospedagem', 'a_confirmar')
  item('trip-recife', 'Passeio em Porto de Galinhas', 'roteiro', 'a_confirmar')
  item('trip-recife', 'Transfer do aeroporto', 'transporte', 'a_confirmar')
  item('trip-recife', 'Restaurante Leite', 'comida', 'a_confirmar')
  item('trip-recife', 'Voo GRU → REC', 'voo', 'confirmado')
  item('trip-africa', 'Safari no Kruger', 'reserva', 'a_confirmar', 'Johannesburg / Safari')
  item('trip-africa', 'Hospedagem em Cape Town', 'hospedagem', 'a_confirmar', 'Cape Town')
  item('trip-africa', 'Passaporte válido', 'documento', 'a_fazer')
  item('trip-africa', 'Vacina de febre amarela', 'antes_de_ir', 'a_fazer')
  item('trip-africa', 'Subir a Table Mountain', 'quero_ir', 'a_confirmar', 'Cape Town')
  item('trip-africa', 'Voo para Johannesburg', 'voo', 'confirmado')

  // Capture
  add('brainDump', { text: 'Ver safari com guia que fale português', status: 'inbox', group: 'África do Sul' })
  add('brainDump', { text: 'Lista de vinícolas perto de Cape Town', status: 'inbox', group: 'África do Sul' })
  add('brainDump', { text: 'Ideia de vídeo UGC: rotina de treino às 5h', status: 'inbox' })
  add('notes', { title: 'Ideias de onboarding FashionFinder', body: 'Quiz de estilo no primeiro acesso', kind: 'ideia', tags: [], pinned: false, projectId: 'proj-fashionfinder' })

  // Content
  add('contentItems', { title: 'Rotina de treino às 5h', stage: 'gravar', platform: 'Instagram', format: 'Reels', links: [], order: 0 })
  add('partnerships', { brand: 'Track&Field', format: 'Reels + stories', stage: 'negociacao', links: [], order: 0 })

  // Luna
  add('pets', { id: 'pet-luna', name: 'Luna', species: 'cachorro', breed: 'SRD', documents: [] })
  add('petTasks', { petId: 'pet-luna', title: 'Banho da Luna', category: 'banho', recurrence: { kind: 'every_n_days', days: 15, anchor: d(-20), fromLastDone: true }, active: true, order: 0 })
  add('petTasks', { petId: 'pet-luna', title: 'Vermífugo', category: 'medicacao', dueDate: d(8), active: true, order: 1 })

  // Goals / routines
  add('goals', { level: 'maior', title: 'Correr uma prova de trail', category: 'corpo', big: true, status: 'ativa', order: 0 })
  add('routines', { id: 'routine-manha', name: 'Minha manhã', period: 'manha', order: 0, active: true })
  add('routineItems', { routineId: 'routine-manha', title: 'Beber água', emoji: '💧', recurrence: { kind: 'daily' }, order: 0, active: true })

  return db
}
