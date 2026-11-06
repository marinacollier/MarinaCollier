/**
 * Rows of the hubs (Minha Vida, Projetos): a quiet icon, the name and one live line. Icons, not emojis, so
 * the interface reads the same everywhere; a project keeps its own emoji only as the fallback.
 */
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  BookHeart,
  Bookmark,
  BookOpen,
  CalendarCheck,
  CalendarRange,
  ChevronRight,
  Clapperboard,
  Compass,
  FolderKanban,
  Gem,
  GraduationCap,
  Heart,
  Hourglass,
  House,
  Inbox,
  ListChecks,
  PawPrint,
  PenLine,
  Plane,
  RotateCcw,
  Soup,
  Target,
  TrendingUp,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { TONE } from '@/components/ui/tone'
import { cn } from '@/lib/cn'
import type { SpaceEntry } from './entries'

const ICONS: Record<string, LucideIcon> = {
  treinos: Activity,
  nutricao: Utensils,
  mealprep: Soup,
  evolucao: TrendingUp,
  universo: Gem,
  cuidar: Heart,
  biblia: BookHeart,
  atelie: PenLine,
  estudos: GraduationCap,
  salvos: Bookmark,
  livros: BookOpen,
  viagens: Plane,
  luna: PawPrint,
  casa: House,
  inbox: Inbox,
  tarefas: ListChecks,
  semana: CalendarRange,
  metas: Target,
  revisao: RotateCcw,
  mes: CalendarCheck,
  financas: Wallet,
  career: Compass,
  creator: Clapperboard,
  waiting: Hourglass,
}

export const iconFor = (key: string): LucideIcon => ICONS[key] ?? (key.startsWith('project:') ? FolderKanban : ListChecks)

export function HubRow({ e }: { e: SpaceEntry }) {
  const nav = useNavigate()
  const Icon = iconFor(e.key)
  return (
    <button type="button" onClick={() => nav(e.to)} className="w-full flex items-center gap-3.5 min-h-[56px] py-2 px-4 text-left active:bg-surface-2 transition-colors">
      <span aria-hidden className={cn('h-9 w-9 shrink-0 rounded-[12px] inline-flex items-center justify-center', TONE[e.tone].soft)}>
        <Icon size={18} strokeWidth={1.7} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15.5px] leading-snug truncate">{e.label}</span>
        {e.hint && <span className="block text-[13px] text-muted mt-0.5 truncate">{e.hint}</span>}
      </span>
      <ChevronRight size={17} className="text-muted/50 shrink-0" />
    </button>
  )
}

export function HubSection({ label, entries, all, onAll, delay = 0 }: { label: string; entries: SpaceEntry[]; all?: string; onAll?: () => void; delay?: number }) {
  return (
    <section aria-label={label} className="mt-6" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between min-h-9 px-1 mb-1.5">
        <h2 className="eyebrow">{label}</h2>
        {all && onAll && (
          <button type="button" onClick={onAll} className="h-9 -mr-1 px-1 text-[12.5px] text-muted active:opacity-70">
            {all}
          </button>
        )}
      </div>
      <div className="card overflow-hidden divide-y divide-line/60">
        {entries.map((e) => (
          <HubRow key={e.key} e={e} />
        ))}
      </div>
    </section>
  )
}
