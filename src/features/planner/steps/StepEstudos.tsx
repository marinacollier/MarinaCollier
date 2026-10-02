import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Button, Chip, EmptyState, TONE } from '@/components/ui'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { studyOptions } from '../plan'
import { Quiet } from '../ui'
import type { StepProps } from './types'

const MAX = 3

export function StepEstudos({ db, weekStart, draft, setDraft }: StepProps) {
  const nav = useNavigate()
  const tracks = useMemo(() => studyOptions(db), [db])
  const existingGoals = useMemo(() => new Set(db.goals.filter((g) => g.level === 'semana' && g.period === weekStart && g.category === 'estudo').map((g) => g.title)), [db, weekStart])

  const toggleTrack = (trackId: string) =>
    setDraft((d) => {
      if (d.study.some((s) => s.trackId === trackId)) return { ...d, study: d.study.filter((s) => s.trackId !== trackId) }
      if (d.study.length >= MAX) {
        toast('Tem coisa demais aqui. Escolhe três.')
        return d
      }
      haptic('light')
      return { ...d, study: [...d.study, { trackId }] }
    })

  const pickItem = (trackId: string, itemId: string) =>
    setDraft((d) => {
      const cur = d.study.find((s) => s.trackId === trackId)
      if (!cur) {
        if (d.study.length >= MAX) {
          toast('Tem coisa demais aqui. Escolhe três.')
          return d
        }
        return { ...d, study: [...d.study, { trackId, itemId }] }
      }
      return { ...d, study: d.study.map((s) => (s.trackId === trackId ? { trackId, itemId: s.itemId === itemId ? undefined : itemId } : s)) }
    })

  if (!tracks.length)
    return (
      <EmptyState
        emoji="📚"
        title="Nenhuma trilha ativa"
        text="Quando tiver uma trilha de estudo ativa, ela aparece aqui pra virar foco da semana."
        action={
          <Button variant="soft" onClick={() => nav(ROUTES.study)}>
            Abrir Estudos
          </Button>
        }
      />
    )

  return (
    <div className="space-y-2.5">
      {tracks.map(({ track, items }) => {
        const sel = draft.study.find((s) => s.trackId === track.id)
        const already = [...existingGoals].some((t) => t.startsWith(`${track.emoji} ${track.name}`))
        return (
          <div key={track.id} className={cn('card p-3.5 transition-shadow', sel && 'ring-2 ring-accent/70')}>
            <button type="button" onClick={() => toggleTrack(track.id)} aria-pressed={!!sel} className="w-full flex items-center gap-3 text-left min-h-11">
              <span aria-hidden className={cn('h-10 w-10 rounded-[14px] inline-flex items-center justify-center text-[20px] shrink-0', TONE[track.tone].soft)}>
                {track.emoji}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium leading-snug">{track.name}</span>
                <span className="block text-[12.5px] text-muted truncate">
                  {track.status === 'continuo' ? 'contínuo' : 'ativo'}
                  {track.formats?.length ? ` · ${track.formats.slice(0, 3).join(', ')}` : ''}
                  {already ? ' · já é foco dessa semana' : ''}
                </span>
              </span>
              <span className={cn('h-7 w-7 rounded-full inline-flex items-center justify-center shrink-0 border-[1.5px]', sel ? 'bg-accent border-accent text-white' : 'border-muted/50')}>
                {sel && <Check size={15} strokeWidth={3} />}
              </span>
            </button>
            {items.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2.5 pl-[52px]">
                {items.slice(0, 4).map((it) => (
                  <Chip key={it.id} selected={sel?.itemId === it.id} onClick={() => pickItem(track.id, it.id)} className="max-w-full">
                    <span className="truncate">
                      {it.status === 'estudando' ? '▶︎ ' : ''}
                      {it.title}
                    </span>
                  </Chip>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <Quiet className="pt-2">Até três. Cada escolha vira uma meta leve da semana em Metas — sem cobrança, sem contagem.</Quiet>
    </div>
  )
}
