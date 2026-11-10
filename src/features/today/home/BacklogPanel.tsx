/**
 * Backlog — one calm line on Home ("Backlog · 19 itens"). Tap to open a compact, filterable list of one-line
 * rows; tapping a row opens the task. Replaces the long "Podem esperar" list.
 */
import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { DateKey } from '@/data/types'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { Chip } from './CleanBlocks'
import type { ChipTone } from './clean'
import { backlogCounts, filterBacklog, type BacklogFilter, type BacklogItem } from './backlog'

const MAX_ROWS = 30

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function rowChip(i: BacklogItem, today: DateKey): { text: string; tone: ChipTone } | undefined {
  if (i.status === 'waiting') return { text: i.waitingWho ? `aguardando ${i.waitingWho}` : 'aguardando', tone: 'soft' }
  if (i.dueDate) {
    if (i.dueDate < today) return { text: 'vencida', tone: 'alert' }
    const [, m, d] = i.dueDate.split('-')
    return { text: `vence ${d}/${m}`, tone: i.bucket === 'prioritario' ? 'warn' : 'soft' }
  }
  if (i.projectName) return { text: i.projectName, tone: 'soft' }
  return undefined
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="shrink-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('h-8 max-w-[150px] rounded-full px-3 text-[12.5px] bg-surface-2 appearance-none truncate', value ? 'text-ink' : 'text-ink-2')}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function BacklogPanel({ items, today, onOpen }: { items: BacklogItem[]; today: DateKey; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<BacklogFilter>({})
  const counts = backlogCounts(items)
  const projects = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) if (i.projectId && i.projectName) m.set(i.projectId, i.projectName)
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }, [items])
  const shown = useMemo(() => filterBacklog(items, f, today), [items, f, today])

  if (!items.length) return null

  const parts = [
    counts.prioritario && plural(counts.prioritario, 'prioritário', 'prioritários'),
    counts.aguardando && `${counts.aguardando} aguardando`,
    counts.sem_urgencia && `${counts.sem_urgencia} sem urgência`,
  ].filter(Boolean)
  const filtered = !!(f.project || f.priority || f.due || f.bucket)

  return (
    <section aria-label="Backlog">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          haptic('light')
          setOpen((o) => !o)
        }}
        className="w-full min-h-11 flex items-center gap-2 text-left active:opacity-70"
      >
        <span className="shrink-0 text-[15px] text-ink font-medium">Backlog · {plural(counts.total, 'item', 'itens')}</span>
        <span className="flex-1 min-w-0 truncate text-[12px] text-muted">{parts.join(' · ')}</span>
        <ChevronDown size={16} aria-hidden className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="pb-1">
          <div className="flex gap-1.5 overflow-x-auto py-1 -mx-1 px-1" role="group" aria-label="Filtros do backlog">
            {projects.length > 0 && <Select label="Projeto" value={f.project ?? ''} onChange={(v) => setF({ ...f, project: v || undefined })} options={projects} />}
            <Select
              label="Prioridade"
              value={f.priority ?? ''}
              onChange={(v) => setF({ ...f, priority: v || undefined })}
              options={[
                { value: 'alta', label: 'Alta' },
                { value: 'media', label: 'Média' },
                { value: 'baixa', label: 'Baixa' },
              ]}
            />
            <Select
              label="Vencimento"
              value={f.due ?? ''}
              onChange={(v) => setF({ ...f, due: (v || undefined) as BacklogFilter['due'] })}
              options={[
                { value: 'vencidas', label: 'Vencidas' },
                { value: '7dias', label: 'Próximos 7 dias' },
                { value: 'sem_prazo', label: 'Sem prazo' },
              ]}
            />
            <Select
              label="Status"
              value={f.bucket ?? ''}
              onChange={(v) => setF({ ...f, bucket: (v || undefined) as BacklogFilter['bucket'] })}
              options={[
                { value: 'prioritario', label: 'Prioritário' },
                { value: 'aguardando', label: 'Aguardando' },
                { value: 'sem_urgencia', label: 'Sem urgência' },
              ]}
            />
            {filtered && (
              <button type="button" onClick={() => setF({})} className="shrink-0 h-8 px-3 rounded-full text-[12.5px] text-muted active:opacity-70">
                Limpar
              </button>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="min-h-11 flex items-center text-[13px] text-muted">Nada com esses filtros.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {shown.slice(0, MAX_ROWS).map((i) => {
                const chip = rowChip(i, today)
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light')
                        onOpen(i.id)
                      }}
                      className="w-full min-h-11 flex items-center gap-3 text-left active:opacity-70"
                    >
                      <span className="flex-1 min-w-0 truncate text-[14.5px] text-ink">{i.title}</span>
                      {chip && <Chip tone={chip.tone}>{chip.text}</Chip>}
                    </button>
                  </li>
                )
              })}
              {shown.length > MAX_ROWS && <li className="min-h-9 flex items-center text-[12px] text-muted">+{shown.length - MAX_ROWS}</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
