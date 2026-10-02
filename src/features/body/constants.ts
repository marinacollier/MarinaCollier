/** Labels and small lookup tables for the Corpo module (pt-BR). */
import type { DailyCheckIn, FoodTag, MealSlot, Tone, WorkoutGoal, WorkoutStatus } from '@/data/types'

export const MEAL_SLOTS: { slot: MealSlot; label: string; emoji: string }[] = [
  { slot: 'cafe', label: 'Café da manhã', emoji: '☕' },
  { slot: 'lanche_manha', label: 'Lanche', emoji: '🍎' },
  { slot: 'almoco', label: 'Almoço', emoji: '🍽️' },
  { slot: 'lanche_tarde', label: 'Lanche', emoji: '🥜' },
  { slot: 'jantar', label: 'Jantar', emoji: '🌙' },
]

export const SLOT_LABEL: Record<MealSlot, string> = {
  cafe: 'Café da manhã',
  lanche_manha: 'Lanche da manhã',
  almoco: 'Almoço',
  lanche_tarde: 'Lanche da tarde',
  jantar: 'Jantar',
  extra: 'Extra',
}

export const FOOD_TAGS: { value: FoodTag; label: string; emoji: string }[] = [
  { value: 'proteina', label: 'proteína', emoji: '🥚' },
  { value: 'fruta', label: 'fruta', emoji: '🍓' },
  { value: 'vegetais', label: 'vegetais', emoji: '🥦' },
]

export const STATUS_META: Record<WorkoutStatus, { label: string; tone: Tone | 'muted' }> = {
  planejado: { label: 'planejado', tone: 'muted' },
  feito: { label: 'feito', tone: 'sage' },
  adaptado: { label: 'adaptado', tone: 'sand' },
  descanso: { label: 'descanso', tone: 'ocean' },
  pulado: { label: 'ficou pra próxima', tone: 'muted' },
}

export const INTENSITY: { value: 'leve' | 'moderado' | 'forte'; label: string }[] = [
  { value: 'leve', label: 'leve' },
  { value: 'moderado', label: 'moderado' },
  { value: 'forte', label: 'forte' },
]

export const FEELINGS: { value: 1 | 2 | 3 | 4 | 5; emoji: string; label: string }[] = [
  { value: 1, emoji: '😮‍💨', label: 'pesado' },
  { value: 2, emoji: '😐', label: 'ok' },
  { value: 3, emoji: '🙂', label: 'bom' },
  { value: 4, emoji: '😄', label: 'muito bom' },
  { value: 5, emoji: '🤩', label: 'incrível' },
]

export const MOODS: { value: 1 | 2 | 3 | 4 | 5; emoji: string; label: string }[] = [
  { value: 1, emoji: '😔', label: 'pra baixo' },
  { value: 2, emoji: '😕', label: 'meh' },
  { value: 3, emoji: '😌', label: 'tranquila' },
  { value: 4, emoji: '😊', label: 'bem' },
  { value: 5, emoji: '🥰', label: 'ótima' },
]

export const ENERGIA: { value: NonNullable<DailyCheckIn['energia']>; label: string }[] = [
  { value: 'baixa', label: 'baixa' },
  { value: 'media', label: 'média' },
  { value: 'alta', label: 'alta' },
]
export const SONO: { value: NonNullable<DailyCheckIn['sono']>; label: string }[] = [
  { value: 'ruim', label: 'ruim' },
  { value: 'ok', label: 'ok' },
  { value: 'bom', label: 'bom' },
]
export const CORPO: { value: NonNullable<DailyCheckIn['corpo']>; label: string }[] = [
  { value: 'cansado', label: 'cansado' },
  { value: 'normal', label: 'normal' },
  { value: 'forte', label: 'forte' },
]

export const GOAL_KINDS: { value: WorkoutGoal['kind']; label: string; emoji: string; hint: string }[] = [
  { value: 'sessions', label: 'Sessões', emoji: '🔁', hint: 'treinar X vezes' },
  { value: 'distance', label: 'Distância', emoji: '🛣️', hint: 'correr ou pedalar X km' },
  { value: 'event', label: 'Prova / viagem', emoji: '🏁', hint: 'preparar algo com data' },
  { value: 'habit', label: 'Hábito', emoji: '🌱', hint: 'X vezes por semana' },
]

/** Modality groups used by goals and summaries. A goal's `modality` can be a modality id or a group key. */
export const MODALITY_GROUPS: { key: string; label: string; emoji: string; ids: string[] }[] = [
  { key: 'grupo:corrida', label: 'Corrida + trail', emoji: '🏃‍♀️', ids: ['corrida', 'trail'] },
  { key: 'grupo:bike', label: 'Bike (todas)', emoji: '🚴‍♀️', ids: ['bike', 'gravel', 'speed'] },
  { key: 'grupo:mobilidade', label: 'Yoga + mobilidade', emoji: '🧘‍♀️', ids: ['yoga', 'mobilidade'] },
]

export const HABIT_ROWS: { key: 'agua' | 'proteina' | 'fruta' | 'vegetais' | 'refeicoesPlanejadas'; label: string; emoji: string }[] = [
  { key: 'agua', label: 'água', emoji: '💧' },
  { key: 'proteina', label: 'proteína', emoji: '🥚' },
  { key: 'fruta', label: 'fruta', emoji: '🍓' },
  { key: 'vegetais', label: 'vegetais', emoji: '🥦' },
  { key: 'refeicoesPlanejadas', label: 'refeições planejadas', emoji: '📝' },
]

export const REST_MODALITY = 'recuperacao'
