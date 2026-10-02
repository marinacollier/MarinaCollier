import { useMemo, useState } from 'react'
import { Star } from 'lucide-react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { removeWithUndo } from '@/app/undo'
import { actions, nextOrder, useDB } from '@/data/store'
import type { Area, DateKey, Goal, GoalLevel } from '@/data/types'
import { ChipSelect, DateInput, Field, MoreOptions, Select, SheetLayout, TextArea, TitleInput } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { formatShortDate } from '@/lib/date'
import { AREAS, bigRivals, defaultPeriod, MAX_BIG, progressLabel, weekLabel } from './logic'
import { BigChoice, Switch } from './components'

const LEVEL_OPTIONS: { value: GoalLevel; label: string }[] = [
  { value: 'dia', label: 'Hoje' },
  { value: 'semana', label: 'Semana' },
  { value: 'maior', label: 'Maior' },
]

export default function GoalSheet({ id, level: initialLevel }: SheetProps<'goal'>) {
  const goals = useDB((db) => db.goals)
  const today = useToday()
  const existing = useMemo(() => (id ? goals.find((g) => g.id === id) : undefined), [goals, id])

  const [title, setTitle] = useState(existing?.title ?? '')
  const [level, setLevel] = useState<GoalLevel>(existing?.level ?? initialLevel ?? 'semana')
  const [period, setPeriod] = useState<DateKey | undefined>(
    existing ? existing.period : defaultPeriod(initialLevel ?? 'semana', today),
  )
  const [category, setCategory] = useState<Area>(existing?.category ?? 'pessoal')
  const [big, setBig] = useState<boolean>(() => {
    if (existing) return existing.big
    const lvl = initialLevel ?? 'semana'
    return bigRivals(goals, { level: lvl, period: defaultPeriod(lvl, today) }).length < MAX_BIG
  })
  const [deadline, setDeadline] = useState(existing?.deadline)
  const [progress, setProgress] = useState(existing?.progress ?? 0)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [parentId, setParentId] = useState(existing?.parentId)
  const [choosing, setChoosing] = useState(false)

  const changeLevel = (l: GoalLevel) => {
    setLevel(l)
    setPeriod(existing && existing.level === l ? existing.period : defaultPeriod(l, today))
    setChoosing(false)
  }

  const rivals = useMemo(() => bigRivals(goals, { id, level, period }), [goals, id, level, period])
  const parents = useMemo(
    () => goals.filter((g) => g.level === 'maior' && g.id !== id && !g.parentId && g.status !== 'solta'),
    [goals, id],
  )

  const periodLabel =
    level === 'dia' && period
      ? period === today
        ? 'hoje'
        : formatShortDate(period)
      : level === 'semana' && period
        ? `semana ${weekLabel(period)}`
        : 'sem data fixa'

  const save = (opts: { forceSmall?: boolean; swapId?: string } = {}) => {
    const t = title.trim()
    if (!t) return
    const wantsBig = big && !opts.forceSmall
    if (wantsBig && !opts.swapId && rivals.length >= MAX_BIG) {
      setChoosing(true)
      return
    }
    if (opts.swapId) actions.update('goals', opts.swapId, { big: false })
    const data: Partial<Goal> = {
      title: t,
      level,
      period: level === 'maior' ? undefined : period,
      category,
      big: wantsBig,
      deadline,
      progress: level === 'maior' || progress ? progress : undefined,
      notes: notes.trim() || undefined,
      parentId: parentId || undefined,
    }
    if (existing) {
      actions.update('goals', existing.id, data)
      toast('Meta atualizada')
    } else {
      actions.create('goals', {
        ...(data as Goal),
        status: 'ativa',
        order: nextOrder(goals),
      })
      toast(wantsBig ? 'Meta grande definida 🎯' : 'Meta anotada')
    }
    closeSheet()
  }

  return (
    <SheetLayout
      title={existing ? 'Editar meta' : 'Nova meta'}
      eyebrow={periodLabel}
      onClose={closeSheet}
      onDelete={
        existing
          ? () => {
              removeWithUndo('goals', existing.id, 'Meta apagada')
              closeSheet()
            }
          : undefined
      }
      primary={{
        label: existing ? 'Salvar' : 'Criar meta',
        onClick: () => save(),
        disabled: !title.trim() || choosing,
      }}
    >
      <TitleInput
        autoFocus={!existing}
        placeholder="O que realmente importa?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        aria-label="Título da meta"
      />

      <ChipSelect value={level} onChange={(v) => v && changeLevel(v)} options={LEVEL_OPTIONS} />

      <Field label="Categoria">
        <ChipSelect
          value={category}
          onChange={(v) => v && setCategory(v)}
          options={AREAS.map((a) => ({
            value: a.value,
            label: `${a.emoji} ${a.label}`,
          }))}
          wrap={false}
        />
      </Field>

      <button
        type="button"
        onClick={() => {
          setBig((b) => !b)
          setChoosing(false)
        }}
        className="flex items-center gap-2 text-[13.5px] text-ink-2 min-h-11 -my-1"
      >
        <Star size={16} className={big ? 'text-sand' : 'text-muted'} fill={big ? 'currentColor' : 'none'} />
        {big
          ? rivals.length >= MAX_BIG
            ? 'Grande — já tem 3 nesse período'
            : `Uma das grandes (${rivals.length + 1} de ${MAX_BIG})`
          : 'Meta menor — toque para virar grande'}
      </button>

      {choosing && (
        <BigChoice
          rivals={rivals}
          onSwap={(sid) => save({ swapId: sid })}
          onKeepSmall={() => save({ forceSmall: true })}
          onCancel={() => setChoosing(false)}
        />
      )}

      <MoreOptions defaultOpen={!!existing && (existing.level === 'maior' || !!existing.notes)}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[14.5px]">Meta grande</div>
            <div className="text-[12.5px] text-muted">No máximo 3 por período — o que realmente importa.</div>
          </div>
          <Switch
            checked={big}
            onChange={(v) => {
              setBig(v)
              setChoosing(false)
            }}
            label="Meta grande"
          />
        </div>

        <Field label="Prazo" hint={level === 'maior' ? 'Opcional — sem pressa.' : undefined}>
          <DateInput value={deadline} onChange={setDeadline} />
        </Field>

        <Field label={`Progresso · ${progressLabel(progress)}`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="w-full h-11 accent-accent"
            aria-label="Progresso"
          />
        </Field>

        <Field label="Notas">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Por que isso importa, próximos passos…"
          />
        </Field>

        {parents.length > 0 && (
          <Field label="Faz parte de uma meta maior?">
            <Select
              value={parentId}
              onChange={setParentId}
              placeholder="Nenhuma"
              options={parents.map((p) => ({ value: p.id, label: p.title }))}
            />
          </Field>
        )}
      </MoreOptions>
    </SheetLayout>
  )
}
