import type { ModuleId, ThemePref } from '@/data/types'
import { ROUTES } from '@/app/routes'

export interface ModuleEntry {
  key: string
  label: string
  emoji: string
  to: string
  /** When set, visibility follows profile.modules. */
  module?: ModuleId
  tone: 'accent' | 'sage' | 'ocean' | 'sand' | 'plum' | 'ink'
}

/** Modules that can be hidden from Espaços (Design). Nothing is deleted when hidden. */
export const HIDEABLE_MODULES: (ModuleEntry & { module: ModuleId })[] = [
  { key: 'corpo', label: 'Corpo', emoji: '🏃‍♀️', to: ROUTES.body, module: 'corpo', tone: 'accent' },
  { key: 'creator', label: 'Creator / UGC', emoji: '🎬', to: ROUTES.creator, module: 'creator', tone: 'plum' },
  { key: 'estudos', label: 'Estudos', emoji: '📚', to: ROUTES.study, module: 'estudos', tone: 'ocean' },
  { key: 'livros', label: 'Livros', emoji: '📖', to: ROUTES.books, module: 'livros', tone: 'plum' },
  { key: 'viagens', label: 'Viagens', emoji: '✈️', to: ROUTES.trips, module: 'viagens', tone: 'ocean' },
  { key: 'dinheiro', label: 'Finanças', emoji: '💸', to: ROUTES.money, module: 'dinheiro', tone: 'sage' },
  { key: 'luna', label: 'Luna', emoji: '🐾', to: ROUTES.luna, module: 'luna', tone: 'sand' },
  { key: 'vida_real', label: 'Casa & admin', emoji: '🏡', to: ROUTES.lifeAdmin, module: 'vida_real', tone: 'sand' },
  { key: 'inbox', label: 'Inbox & notas', emoji: '🧠', to: ROUTES.inbox, module: 'inbox', tone: 'ink' },
]

export const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Automático' },
]
