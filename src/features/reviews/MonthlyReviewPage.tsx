import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Camera, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { actions, getDB, useDB } from '@/data/store'
import type { MonthlyReview } from '@/data/types'
import {
  Button,
  Card,
  IconButton,
  Page,
  PageHeader,
  Pill,
  ProgressBar,
  SectionTitle,
  TextArea,
  TextInput,
} from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { formatShortDate, monthKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { formatBRLShort } from '@/lib/money'
import { nowISO } from '@/lib/id'
import { boardEventOfMonth, findMonthlyReview, monthData, monthLabel, shiftMonth } from './monthly'
import { AgendaHint } from './AgendaHint'
import { plural } from './shared'

function upsertMonthly(month: string, patch: Partial<MonthlyReview>) {
  const ex = findMonthlyReview(getDB().monthlyReviews, month)
  if (ex) actions.update('monthlyReviews', ex.id, patch)
  else actions.create('monthlyReviews', { month, highlights: [], ...patch })
}

export default function MonthlyReviewPage() {
  const db = useDB()
  const today = useToday()
  const current = monthKey(today)
  const [month, setMonth] = useState(current)
  const data = useMemo(() => monthData(db, month), [db, month])
  const review = findMonthlyReview(db.monthlyReviews, month)
  const board = useMemo(() => boardEventOfMonth(db, month), [db, month])

  return (
    <Page>
      <PageHeader back title="Meu mês" subtitle="O que aconteceu, sem cobrança. Só pra lembrar e levar adiante." />

      <Card className="flex items-center gap-2">
        <IconButton label="Mês anterior" size="sm" variant="soft" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={18} />
        </IconButton>
        <div className="flex-1 text-center">
          <div className="eyebrow">
            {month === current ? 'Este mês' : review?.completedAt ? 'Mês guardado ✓' : 'Mês'}
          </div>
          <div className="font-display text-[24px] leading-tight mt-0.5 first-letter:uppercase">
            {monthLabel(month)}
          </div>
        </div>
        <IconButton
          label="Próximo mês"
          size="sm"
          variant="soft"
          disabled={month >= current}
          className="disabled:opacity-30"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRight size={18} />
        </IconButton>
      </Card>

      {board && (
        <AgendaHint
          emoji="🏛️"
          title={board.event.title}
          when={`${formatShortDate(board.date)}${board.event.startTime ? ` · ${board.event.startTime}` : ''}`}
          eventId={board.event.id}
        />
      )}

      <motion.div
        key={month}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Highlights month={month} review={review} auto={data.autoHighlights} />

        <SectionTitle>Em números gentis</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          <Tile emoji="🏃‍♀️" label="Treinos" value={plural(data.workouts.total, 'treino', 'treinos')}>
            {data.workouts.byModality.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {data.workouts.byModality.map((m) => (
                  <Pill key={m.id}>
                    {m.emoji} {m.label} {m.count}
                  </Pill>
                ))}
              </div>
            )}
          </Tile>
          <Tile emoji="🎯" label="Metas" value={plural(data.goalsDone.length, 'feita', 'feitas')}>
            {data.goalsDone.length > 0 && (
              <Small>
                {data.goalsDone
                  .slice(0, 2)
                  .map((g) => g.title)
                  .join(' · ')}
              </Small>
            )}
          </Tile>
          <Tile emoji="📚" label="Estudos" value={plural(data.studiesFinished.length, 'finalizado', 'finalizados')}>
            {data.studiesFinished.length > 0 && <Small>{data.studiesFinished.map((s) => s.title).join(' · ')}</Small>}
          </Tile>
          <Tile emoji="📖" label="Livros" value={plural(data.booksFinished.length, 'finalizado', 'finalizados')}>
            {data.booksFinished.length > 0 && <Small>{data.booksFinished.map((b) => b.title).join(' · ')}</Small>}
          </Tile>
          <Tile emoji="📝" label="Notas" value={plural(data.notesCreated, 'criada', 'criadas')} />
          <Tile emoji="✨" label="Wins" value={plural(data.wins.length, 'win', 'wins')} />
        </div>

        {data.spend.count > 0 && (
          <>
            <SectionTitle>Gastos</SectionTitle>
            <Card>
              <div className="flex items-baseline justify-between">
                <div className="font-display text-[26px] leading-none">{formatBRLShort(data.spend.total)}</div>
                <div className="text-[13px] text-muted">{plural(data.spend.count, 'registro', 'registros')}</div>
              </div>
              <div className="space-y-2.5 mt-4">
                {data.spend.top.map((c) => (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-[14px]">
                      <span>
                        {c.emoji} {c.name}
                      </span>
                      <span className="text-ink-2">{formatBRLShort(c.cents)}</span>
                    </div>
                    <ProgressBar value={c.cents} max={data.spend.top[0].cents} tone="sand" className="mt-1" />
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {data.trips.length > 0 && (
          <>
            <SectionTitle>Viagens</SectionTitle>
            <div className="space-y-2">
              {data.trips.map((t) => (
                <Card key={t.id} className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden>
                    {t.flag || '✈️'}
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-[17px] leading-snug">{t.name}</div>
                    <div className="text-[12.5px] text-muted">
                      {t.startDate && formatShortDate(t.startDate)}
                      {t.endDate && t.endDate !== t.startDate ? ` – ${formatShortDate(t.endDate)}` : ''}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        {(data.projectsTouched.length > 0 || data.wins.length > 0) && (
          <>
            <SectionTitle>Trabalho</SectionTitle>
            <Card className="space-y-3">
              {data.projectsTouched.length > 0 && (
                <div>
                  <div className="eyebrow mb-1.5">Projetos que andaram</div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.projectsTouched.map((p) => (
                      <Pill key={p.id}>
                        {p.emoji} {p.name}
                      </Pill>
                    ))}
                  </div>
                </div>
              )}
              {data.wins.length > 0 && (
                <div>
                  <div className="eyebrow mb-1">Wins</div>
                  <ul className="space-y-1">
                    {data.wins.map((w) => (
                      <li key={w.id} className="text-[14.5px] leading-snug">
                        ✨ {w.title} <span className="text-muted text-[12.5px]">· {formatShortDate(w.date)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </>
        )}

        <div className="mt-7 rounded-[22px] border border-dashed border-line px-4 py-5 flex items-center gap-3 text-muted">
          <Camera size={20} className="shrink-0" />
          <div>
            <div className="text-[14.5px] text-ink-2">Fotos do mês</div>
            <div className="text-[12.5px]">em breve</div>
          </div>
        </div>

        <TakeForward month={month} review={review} />
      </motion.div>
    </Page>
  )
}

function Tile({
  emoji,
  label,
  value,
  children,
}: {
  emoji: string
  label: string
  value: string
  children?: ReactNode
}) {
  return (
    <div className="card p-3.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <span aria-hidden>{emoji}</span>
        <span className="eyebrow truncate">{label}</span>
      </div>
      <div className="font-display text-[19px] leading-tight mt-1.5">{value}</div>
      {children}
    </div>
  )
}

function Small({ children }: { children: ReactNode }) {
  return <div className="text-[12.5px] text-muted mt-1 line-clamp-2">{children}</div>
}

function Highlights({
  month,
  review,
  auto,
}: {
  month: string
  review?: MonthlyReview
  auto: ReturnType<typeof monthData>['autoHighlights']
}) {
  const [text, setText] = useState('')
  const mine = review?.highlights ?? []
  const add = () => {
    const t = text.trim()
    if (!t) return
    upsertMonthly(month, { highlights: [...mine, t] })
    setText('')
    haptic('light')
  }
  const removeAt = (i: number) => {
    const removed = mine[i]
    const next = mine.filter((_, j) => j !== i)
    upsertMonthly(month, { highlights: next })
    toast('Removido', {
      action: {
        label: 'Desfazer',
        run: () => {
          const cur = findMonthlyReview(getDB().monthlyReviews, month)?.highlights ?? []
          upsertMonthly(month, { highlights: [...cur.slice(0, i), removed, ...cur.slice(i)] })
        },
      },
    })
  }

  return (
    <>
      <SectionTitle>Principais acontecimentos</SectionTitle>
      <Card className="space-y-1">
        {mine.map((h, i) => (
          <div key={`${h}-${i}`} className="flex items-start gap-2.5 min-h-10">
            <span className="text-accent mt-[3px]" aria-hidden>
              ●
            </span>
            <span className="flex-1 text-[15px] leading-snug pt-0.5">{h}</span>
            <IconButton label={`Remover ${h}`} size="sm" className="-mt-1 -mr-2" onClick={() => removeAt(i)}>
              <X size={15} />
            </IconButton>
          </div>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <TextInput
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Algo que marcou o mês…"
            aria-label="Novo acontecimento"
          />
          <IconButton
            label="Adicionar acontecimento"
            variant="soft"
            type="submit"
            disabled={!text.trim()}
            className="disabled:opacity-40 h-12 w-12"
          >
            <Plus size={18} />
          </IconButton>
        </form>
        {auto.length > 0 && (
          <div className="pt-3">
            <div className="eyebrow mb-1.5">Do seu app</div>
            <ul className="space-y-1.5">
              {auto.map((a, i) => (
                <li key={i} className="flex gap-2.5 text-[14px] text-ink-2 leading-snug">
                  <span aria-hidden className="w-5 text-center shrink-0">
                    {a.emoji}
                  </span>
                  <span className="flex-1">{a.text}</span>
                  {a.date && <span className="text-[12px] text-muted shrink-0">{formatShortDate(a.date)}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {mine.length === 0 && auto.length === 0 && (
          <p className="text-[13px] text-muted pt-2">Um encontro, um treino bom, uma conversa — vale tudo.</p>
        )}
      </Card>
    </>
  )
}

function TakeForward({ month, review }: { month: string; review?: MonthlyReview }) {
  const [text, setText] = useState(review?.takeForward ?? '')
  const saved = review?.takeForward ?? ''
  const save = (complete: boolean) => {
    if (text.trim() === saved.trim() && !complete) return
    upsertMonthly(month, { takeForward: text.trim() || undefined, ...(complete ? { completedAt: nowISO() } : {}) })
  }
  return (
    <>
      <SectionTitle>Pro próximo mês</SectionTitle>
      <Card>
        <div className="font-display text-[20px] leading-snug">O que quero levar para o próximo mês?</div>
        <TextArea
          rows={4}
          className="mt-3"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => save(false)}
          placeholder="Um hábito, um sentimento, uma intenção…"
          aria-label="O que quero levar para o próximo mês"
        />
        <Button
          variant="primary"
          size="lg"
          className="mt-3"
          onClick={() => {
            save(true)
            haptic('success')
            toast('Mês guardado 🌿', { tone: 'win' })
          }}
        >
          {review?.completedAt ? 'Atualizar' : 'Guardar meu mês'}
        </Button>
      </Card>
    </>
  )
}
