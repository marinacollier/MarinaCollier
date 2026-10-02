import { useMemo, useState } from 'react'
import { Copy, Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { useDB } from '@/data/store'
import type { DateKey, ID, WinKind } from '@/data/types'
import { useToday } from '@/hooks/useToday'
import { addMonths, formatFullDate, formatShortDate } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { pluralize } from '@/lib/text'
import { Button, Chip, EmptyState, IconButton, Page, PageHeader, SectionTitle, Segmented, Select } from '@/components/ui'
import { WIN_KINDS, winKind } from './constants'
import { Reveal, Tag } from './components'
import { groupWinsByMonth, resumeBullets } from './selectors'

type Period = 'ano' | '12m' | '6m' | 'tudo'

function periodRange(p: Period, today: DateKey): { from?: DateKey; to?: DateKey } {
  if (p === 'ano') return { from: `${today.slice(0, 4)}-01-01`, to: today }
  if (p === '12m') return { from: addMonths(today, -12), to: today }
  if (p === '6m') return { from: addMonths(today, -6), to: today }
  return {}
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for browsers without async clipboard permission.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export default function WinsPage() {
  const db = useDB()
  const today = useToday()
  const [kind, setKind] = useState<WinKind | undefined>()
  const [projectId, setProjectId] = useState<ID | undefined>()
  const [period, setPeriod] = useState<Period>('12m')
  const [fallbackText, setFallbackText] = useState<string>()

  const filtered = useMemo(
    () => db.wins.filter((w) => (!kind || w.kind === kind) && (!projectId || w.projectId === projectId)),
    [db.wins, kind, projectId],
  )
  const groups = useMemo(() => groupWinsByMonth(filtered), [filtered])
  const range = periodRange(period, today)
  const bullets = useMemo(() => resumeBullets(filtered, db.projects, range.from, range.to), [filtered, db.projects, range.from, range.to])
  const bulletCount = bullets ? bullets.split('\n').length : 0
  const projectsWithWins = useMemo(() => db.projects.filter((p) => db.wins.some((w) => w.projectId === p.id)), [db.projects, db.wins])
  const projName = (id?: ID) => db.projects.find((p) => p.id === id)

  const copy = async () => {
    if (!bullets) return
    const ok = await copyText(bullets)
    if (ok) {
      haptic('success')
      setFallbackText(undefined)
      toast(`${pluralize(bulletCount, 'win copiado', 'wins copiados')} ✨`, { tone: 'win' })
    } else {
      setFallbackText(bullets)
      toast('Não deu pra copiar direto — selecione o texto abaixo')
    }
  }

  return (
    <Page>
      <PageHeader
        back
        backTo={ROUTES.work}
        eyebrow="Trabalho"
        title="Wins ✨"
        subtitle={db.wins.length ? `${pluralize(db.wins.length, 'conquista guardada', 'conquistas guardadas')}` : 'O que deu certo merece ficar registrado'}
        actions={
          <IconButton label="Novo win" onClick={() => openSheet('win')}>
            <Plus size={22} />
          </IconButton>
        }
      />

      {db.wins.length === 0 ? (
        <div className="card">
          <EmptyState
            emoji="✨"
            title="Seu mural de conquistas"
            text="Entregas, feedbacks, contratos, resultados. Guarde aqui e o currículo se escreve sozinho."
            action={
              <Button variant="accent" size="sm" icon={<Plus size={15} />} onClick={() => openSheet('win')}>
                Registrar um win
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
            <Chip selected={!kind} onClick={() => setKind(undefined)}>
              todos
            </Chip>
            {WIN_KINDS.map((k) => (
              <Chip key={k.value} selected={kind === k.value} onClick={() => setKind(kind === k.value ? undefined : k.value)}>
                {k.emoji} {k.label}
              </Chip>
            ))}
          </div>
          {projectsWithWins.length > 0 && (
            <Select
              className="mt-2.5"
              value={projectId}
              onChange={setProjectId}
              placeholder="Todos os projetos"
              options={projectsWithWins.map((p) => ({ value: p.id, label: `${p.emoji} ${p.name}` }))}
            />
          )}

          <Reveal>
            <div className="card p-4 mt-5">
              <div className="eyebrow">Para currículo / LinkedIn</div>
              <Segmented
                className="mt-3"
                value={period}
                onChange={setPeriod}
                options={[
                  { value: '6m', label: '6 meses' },
                  { value: '12m', label: '12 meses' },
                  { value: 'ano', label: 'Este ano' },
                  { value: 'tudo', label: 'Tudo' },
                ]}
              />
              <div className="text-[13px] text-muted mt-2.5">
                {bulletCount
                  ? `${pluralize(bulletCount, 'item', 'itens')}${range.from ? ` desde ${formatFullDate(range.from)}` : ''}${kind || projectId ? ' (com os filtros acima)' : ''}`
                  : 'Nenhum win nesse período com esses filtros.'}
              </div>
              <Button variant="primary" size="md" block className="mt-3" icon={<Copy size={16} />} onClick={copy} disabled={!bulletCount}>
                Copiar para currículo / LinkedIn
              </Button>
              {fallbackText && (
                <textarea readOnly className="input mt-3 text-[13px] leading-relaxed" rows={6} value={fallbackText} onFocus={(e) => e.currentTarget.select()} />
              )}
            </div>
          </Reveal>

          {groups.length === 0 ? (
            <EmptyState compact emoji="🔎" title="Nada com esse filtro" text="Tenta outro tipo ou projeto." />
          ) : (
            groups.map((g, gi) => (
              <Reveal key={g.month} delay={Math.min(gi, 5) * 0.04}>
                <SectionTitle>{g.label}</SectionTitle>
                <div className="space-y-2.5">
                  {g.wins.map((w) => {
                    const k = winKind(w.kind)
                    const p = projName(w.projectId)
                    return (
                      <button key={w.id} type="button" onClick={() => openSheet('win', { id: w.id })} className="card w-full text-left p-4 flex gap-3 active:scale-[0.99] transition">
                        <span className="h-10 w-10 rounded-2xl bg-sand-soft inline-flex items-center justify-center text-[19px] shrink-0" aria-hidden>
                          {k.emoji}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-display text-[17px] leading-snug">{w.title}</span>
                          {(w.impact || w.description) && <span className="block text-[13.5px] text-ink-2 mt-0.5">{w.impact || w.description}</span>}
                          <span className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <Tag>{k.label}</Tag>
                            {p && <Tag>{`${p.emoji} ${p.name}`}</Tag>}
                            <span className="text-[12px] text-muted">{formatShortDate(w.date)}</span>
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Reveal>
            ))
          )}
        </>
      )}
    </Page>
  )
}
