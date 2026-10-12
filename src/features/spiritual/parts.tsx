import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { Checkbox, ProgressBar } from '@/components/ui'
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
  return (
    <div className="flex items-center gap-3 min-h-[56px] px-4 py-2">
      <Checkbox checked={done} onChange={(v) => checkSession(s, v)} label={`${s.scriptureReference} concluído`} />
      <button type="button" onClick={() => nav(ROUTES.bibleSession(s.id))} className="flex-1 min-w-0 text-left py-1 active:opacity-70">
        <div className={cn('text-[15px] leading-snug', done && 'text-ink-2')}>
          <span className="font-medium">{s.scriptureReference}</span>
          <span className="text-muted"> · {s.title}</span>
        </div>
        <div className="text-[12px] text-muted mt-0.5">
          {[showPlan, doneLabel(s) ?? (s.status === 'em_andamento' ? 'em andamento' : undefined), annotated ? 'com reflexão' : undefined, s.complementary ? 'complementar' : undefined].filter(Boolean).join(' · ') || `${s.estimatedMinutes} min`}
        </div>
      </button>
    </div>
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
