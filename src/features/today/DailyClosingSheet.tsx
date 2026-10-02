import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { Chip, Field, SheetLayout, TextArea, TextInput } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import { checkinFor } from '@/data/selectors'
import type { DailyCheckIn } from '@/data/types'
import { formatBRL } from '@/lib/money'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { nowISO } from '@/lib/id'
import { todayKey } from '@/lib/date'
import { closingSummary, ensureCheckin, MOODS } from './closing'
import { carryToTomorrow, FULL_COPY, isCarried } from './priorities'

type Mood = NonNullable<DailyCheckIn['closing']>['mood']

export default function DailyClosingSheet({ date: dateProp }: SheetProps<'dailyClosing'>) {
  const date = dateProp ?? todayKey()
  const db = useDB()
  const existing = checkinFor(db, date)?.closing
  const summary = useMemo(() => closingSummary(db, date), [db, date])
  const [mood, setMood] = useState<Mood | undefined>(existing?.mood)
  const [win, setWin] = useState(existing?.winText ?? '')
  const [saveWin, setSaveWin] = useState(false)
  const [mind, setMind] = useState('')

  const finish = () => {
    if (!mood) return
    const checkin = ensureCheckin(date)
    const winText = win.trim() || undefined
    actions.update('checkins', checkin.id, { closing: { mood, closedAt: nowISO(), winText } })
    if (winText && saveWin) actions.create('wins', { date, title: winText, kind: 'conquista' })
    if (mind.trim()) actions.create('brainDump', { text: mind.trim(), status: 'inbox' })
    haptic('success')
    toast('Dia encerrado. Boa noite, Marina 🌙', { tone: 'win' })
    closeSheet()
  }

  const facts = [
    { emoji: '✓', text: summary.tasksDone === 0 ? 'Nenhuma tarefa marcada hoje — tudo bem.' : `${summary.tasksDone} ${summary.tasksDone === 1 ? 'tarefa concluída' : 'tarefas concluídas'}` },
    {
      emoji: summary.workouts[0]?.emoji ?? '🌿',
      text: summary.workouts.length ? `Treino realizado: ${summary.workouts.map((w) => w.label).join(', ')}` : 'Sem treino registrado hoje.',
    },
    { emoji: '💸', text: summary.spentCents ? `Gastos do dia: ${formatBRL(summary.spentCents)}` : 'Nenhum gasto registrado.' },
  ]

  return (
    <SheetLayout
      eyebrow="Fechamento"
      title="Dia encerrado 🌙"
      onClose={closeSheet}
      primary={{ label: mood ? (existing ? 'Atualizar' : 'Encerrar o dia') : 'Como foi seu dia?', onClick: finish, disabled: !mood }}
    >
      <div>
        <div className="font-display text-[20px] leading-snug">Como foi seu dia?</div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {MOODS.map((m) => (
            <motion.button
              key={m.value}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                haptic('light')
                setMood(m.value)
              }}
              aria-pressed={mood === m.value}
              className={cn(
                'h-[84px] rounded-2xl flex flex-col items-center justify-center gap-1 border transition-colors',
                mood === m.value ? 'bg-plum-soft border-plum/40' : 'bg-surface-2 border-transparent',
              )}
            >
              <span className="text-[30px] leading-none" aria-hidden>
                {m.emoji}
              </span>
              <span className="text-[12.5px] text-ink-2">{m.label}</span>
            </motion.button>
          ))}
        </div>
      </div>

      <ul className="rounded-2xl bg-surface-2 divide-y divide-line/70">
        {facts.map((f) => (
          <li key={f.text} className="flex items-center gap-3 px-4 py-3 text-[14.5px] text-ink-2">
            <span className="w-5 text-center" aria-hidden>
              {f.emoji}
            </span>
            {f.text}
          </li>
        ))}
      </ul>

      <Field label="Principal win de hoje ✨" hint="pequeno também conta">
        <TextInput value={win} onChange={(e) => setWin(e.target.value)} placeholder="ex.: entreguei a revisão com calma" />
      </Field>
      {win.trim() && (
        <Chip selected={saveWin} onClick={() => setSaveWin((v) => !v)}>
          {saveWin ? <Check size={14} /> : '✨'} salvar como win
        </Chip>
      )}

      {summary.openPriorities.length > 0 && (
        <div>
          <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Ficou pra depois — sem problema</div>
          <ul className="space-y-1.5">
            {summary.openPriorities.map((p) => {
              const carried = isCarried(db, p)
              return (
                <li key={p.id} className="flex items-center gap-2 rounded-2xl border border-line pl-4 pr-1.5 min-h-[52px]">
                  <span className="flex-1 min-w-0 text-[14.5px] truncate">{p.title}</span>
                  <button
                    type="button"
                    disabled={carried}
                    onClick={() => {
                      const res = carryToTomorrow(p.id)
                      if (res.ok) {
                        haptic('light')
                        toast('Vai com você amanhã ✓')
                      } else if (res.reason === 'full') toast(`Amanhã já tem 3. ${FULL_COPY}`)
                    }}
                    className={cn('h-9 px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1 shrink-0 transition', carried ? 'text-sage' : 'bg-surface-2 text-ink active:scale-[0.97]')}
                  >
                    {carried ? (
                      <>
                        <Check size={14} /> amanhã
                      </>
                    ) : (
                      <>
                        levar para amanhã <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <Field label="Tem alguma coisa ocupando sua cabeça antes de dormir?" hint="vai pra inbox — amanhã você vê">
        <TextArea value={mind} onChange={(e) => setMind(e.target.value)} rows={2} placeholder="pode soltar aqui" />
      </Field>

      <p className="text-center font-display italic text-[16px] text-muted pt-1 pb-2">Você fez o que deu. Agora descansa. 🌙</p>
    </SheetLayout>
  )
}
