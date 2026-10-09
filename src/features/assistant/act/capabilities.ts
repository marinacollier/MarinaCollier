/**
 * Lumos Capability Registry — what Lumos can DO, explicitly. Every channel lands on the same handler:
 *   text        typed in the composer
 *   audio       the recording, transcribed → the transcript is text (no separate "voice Lumos")
 *   attachment  a print/photo/PDF read by the Attachment Understanding Layer → structured data + her sentence
 * `handler` is the id in act/respond.ts HANDLERS (or a planner/engine named in `via`). The registry is
 * checked by tests so it can't drift from the code.
 */
import type { AttachmentCategory } from '../attach/types'

export type Channel = 'text' | 'audio' | 'attachment'

export interface Capability {
  id: string
  domain: 'tasks' | 'workouts' | 'nutrition' | 'calendar' | 'books' | 'finance' | 'career' | 'routine' | 'work' | 'travel' | 'memory' | 'backup'
  verb: string
  /** A sentence that triggers it (her words). */
  example: string
  handler?: string
  /** When it's not an act/ handler: the engine behind it. */
  via?: 'planner' | 'nutrition' | 'mealprep'
  channels: Channel[]
  /** Attachment categories that route here. */
  from?: AttachmentCategory[]
}

const TA: Channel[] = ['text', 'audio']
const ALL: Channel[] = ['text', 'audio', 'attachment']

export const CAPABILITIES: Capability[] = [
  // tasks
  { id: 'task.create', domain: 'tasks', verb: 'criar', example: 'adiciona comprar ração da Luna', handler: 'capture', channels: ALL, from: ['task', 'shopping'] },
  { id: 'task.complete', domain: 'tasks', verb: 'concluir', example: 'essa task do Santander já fiz', handler: 'tasks', channels: TA },
  { id: 'task.move', domain: 'tasks', verb: 'mover', example: 'passa LinkedIn pra amanhã', handler: 'tasks', channels: TA },
  { id: 'task.cancel', domain: 'tasks', verb: 'cancelar no dia', example: 'não vou fazer inglês hoje', handler: 'tasks', channels: TA },
  { id: 'task.priority', domain: 'tasks', verb: 'priorizar', example: 'FashionFinder é prioridade hoje', handler: 'work', channels: TA },
  { id: 'waiting.create', domain: 'work', verb: 'esperar alguém', example: 'Fran ficou de me responder sexta', handler: 'work', channels: ALL, from: ['work'] },
  { id: 'waiting.resolve', domain: 'work', verb: 'resolver', example: 'Fran me respondeu', handler: 'work', channels: TA },
  // workouts
  { id: 'workout.complete', domain: 'workouts', verb: 'registrar feito', example: 'acabei de fazer meu treino, foram 7 km em Z2', handler: 'day', channels: TA },
  { id: 'workout.move', domain: 'workouts', verb: 'mover', example: 'passa minha corrida de sexta pra sábado', via: 'planner', channels: TA },
  { id: 'workout.update', domain: 'workouts', verb: 'mudar horário/duração', example: 'domingo o pedal vai ser 3h30', via: 'planner', channels: TA },
  { id: 'workout.cancel', domain: 'workouts', verb: 'pular', example: 'hoje não vou nadar', via: 'planner', channels: TA },
  { id: 'workout.create', domain: 'workouts', verb: 'adicionar', example: 'sábado faço yoga às 9h', via: 'planner', channels: TA },
  // routine
  { id: 'routine.wake', domain: 'routine', verb: 'mudar a manhã', example: 'amanhã acordo 5h30', via: 'planner', channels: TA },
  // nutrition
  { id: 'nutrition.log', domain: 'nutrition', verb: 'registrar comida', example: 'comi um YoPRO agora', via: 'nutrition', channels: TA },
  { id: 'nutrition.adjust', domain: 'nutrition', verb: 'ajustar o resto do dia', example: 'pulei o lanche', via: 'nutrition', channels: TA },
  { id: 'nutrition.shopping', domain: 'nutrition', verb: 'lista de compras', example: 'faz minha lista de compras', handler: 'kitchen', channels: TA },
  // calendar
  { id: 'calendar.create', domain: 'calendar', verb: 'criar evento', example: 'aniversário da Ana sábado 20h', handler: 'calendar', channels: ALL, from: ['event'] },
  { id: 'calendar.update', domain: 'calendar', verb: 'mudar horário', example: 'minha fisioterapia hoje é 13h', via: 'planner', channels: TA },
  { id: 'calendar.cancel', domain: 'calendar', verb: 'cancelar no dia', example: 'amanhã cancelei a fisioterapia', via: 'planner', channels: TA },
  // books
  { id: 'books.finish', domain: 'books', verb: 'terminar', example: 'terminei meu livro', handler: 'books', channels: TA },
  { id: 'books.add', domain: 'books', verb: 'adicionar', example: 'quero ler Inspired', handler: 'books', channels: ALL, from: ['book'] },
  // finance
  { id: 'finance.received', domain: 'finance', verb: 'registrar recebido', example: 'recebi o Santander hoje', handler: 'career', channels: TA },
  { id: 'finance.query', domain: 'finance', verb: 'consultar', example: 'quanto tenho previsto este mês?', handler: 'career', channels: TA },
  // career
  { id: 'career.activity', domain: 'career', verb: 'registrar sessão', example: 'registra 30 min de inglês executivo hoje', handler: 'career', channels: TA },
  { id: 'career.opportunity', domain: 'career', verb: 'vaga', example: 'adiciona uma vaga de Head of Product na empresa X', handler: 'career', channels: TA },
  { id: 'career.contact', domain: 'career', verb: 'networking', example: 'falei com Ana da empresa X hoje', handler: 'career', channels: TA },
  { id: 'career.review', domain: 'career', verb: 'revisão executiva', example: 'faz minha revisão executiva do mês', handler: 'career', channels: TA },
  // travel
  { id: 'travel.query', domain: 'travel', verb: 'o que falta', example: 'o que falta pra viagem?', handler: 'travel', channels: TA },
  // memory & backup
  { id: 'memory.remember', domain: 'memory', verb: 'lembrar', example: 'lembra que eu não como glúten', handler: 'memory', channels: TA },
  { id: 'backup.export', domain: 'backup', verb: 'gerar backup', example: 'gera meu backup', handler: 'backup', channels: TA },
]

/** The capability an attachment category routes to (undefined = Lumos shows what she read and asks). */
export function capabilityFor(category: AttachmentCategory): Capability | undefined {
  return CAPABILITIES.find((c) => c.from?.includes(category))
}
