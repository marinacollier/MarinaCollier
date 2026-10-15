import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { ItemRow, ProgressBar } from '@/components/ui'
import { actions, persist } from '@/data/store'
import { setSessionDone } from '@/data/spiritual/ops'
import type { Progress } from '@/data/spiritual/model'
import type { SpiritualSession } from '@/data/types'
import { formatShortDate, toDateKey } from '@/lib/date'
import { cn } from '@/lib/cn'

export const SUBTITLE = 'Uma fé que pensa, questiona, acolhe e transforma.'

/** Check / uncheck a session (same writer as the Home), saved right away, with Desfazer. */
export function checkSession(s: SpiritualSession, done: boolean) {
  const before = { status: s.status, completedAt: s.completedAt, importedDone: s.importedDone }
  setSessionDone(s.id, done)
  void persist()
  toast(done ? `${s.scriptureReference} concluído` : `${s.scriptureReference} desmarcado — suas reflexões continuam aqui`, {
    action: {
      label: 'Desfazer',
      run: () => {
        actions.update('spiritualSessions', s.id, before)
        void persist()
      },
    },
  })
}

export function doneLabel(s: SpiritualSession): string | undefined {
  if (s.status !== 'concluido') return undefined
  if (s.completedAt) return `concluído em ${formatShortDate(toDateKey(new Date(s.completedAt)))}`
  return s.importedDone ? 'concluído antes do app' : 'concluído'
}

export function SessionRow({ s, annotated, showPlan }: { s: SpiritualSession; annotated?: boolean; showPlan?: string }) {
  const nav = useNavigate()
  const done = s.status === 'concluido'
  const fact = showPlan ?? doneLabel(s) ?? (s.status === 'em_andamento' ? 'em andamento' : annotated ? 'com reflexão' : s.complementary ? 'complementar' : undefined)
  return (
    <ul>
      <ItemRow
        className="px-4"
        title={`${s.scriptureReference} · ${s.title}`}
        meta={fact}
        when={done ? undefined : `${s.estimatedMinutes} min`}
        checked={done}
        onCheck={(v) => checkSession(s, v)}
        onOpen={() => nav(ROUTES.bibleSession(s.id))}
      />
    </ul>
  )
}

export function ProgressLine({ p, className }: { p: Progress; className?: string }) {
  return (
    <div className={className}>
      <ProgressBar value={p.done} max={p.total || 1} tone="plum" />
      <div className="text-[12px] text-muted mt-1.5">
        {p.done} de {p.total} {p.total === 1 ? 'estudo' : 'estudos'} · {p.pct}%
      </div>
    </div>
  )
}

/** Comfortable reading paragraphs (blank line = new paragraph). */
export function Prose({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('space-y-3 text-[16px] leading-[1.7] text-ink-2', className)}>
      {text.split(/\n\s*\n/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  )
}
