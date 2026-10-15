/**
 * The "+": register anything WITHOUT Lumos, in one tap or a short form (≤3 fields, the rest under "mais").
 * Every path writes the same records Lumos and the screens use (features/quick/ops.ts) — the planned training,
 * meal and bill of the day are ticked through the Home's own checkItem. "✓ · Desfazer" only after the device
 * holds the change (saveConfirmed, like Lumos).
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CreditCard, Droplet, Dumbbell, ListChecks, Moon, Receipt, Smile, Sparkles, Store, Utensils, X } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { closeSheet, openSheet, replaceSheet, toast } from '@/app/ui-store'
import type { SheetName, SheetProps } from '@/app/sheet-types'
import { areaLocked, useLockState } from '@/app/lock-store'
import { Button, Chip, DateInput, Field, IconButton, MoneyInput, MoreOptions, NumberInput, Segmented, TextInput, TimeInput, TitleInput } from '@/components/ui'
import { SAVE_FAILED, saveConfirmed } from '@/features/assistant/act/commit'
import { dayItems, type ActionItem } from '@/data/agenda/items'
import { persist, useDB } from '@/data/store'
import type { DateKey, DB } from '@/data/types'
import { checkItem } from '@/features/today/home/act'
import { MOODS } from '@/features/body/constants'
import { orderedModalities } from '@/features/body/selectors'
import { categoriesByUsage } from '@/features/finance/selectors'
import { INCOME_CATEGORY_ID } from '@/data/finance/receivables'
import { addWater, QUICK_AREAS, quickBrand, quickExpense, quickMeal, quickMood, quickSleep, quickTask, quickWorkout, sleepMoodWeek, type QuickArea, type Undo } from '@/features/quick/ops'
import { useToday } from '@/hooks/useToday'
import { addDays, formatDayMonth } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'

type View = 'menu' | 'tarefa' | 'despesa' | 'treino' | 'refeicao' | 'pagamento' | 'sono' | 'humor' | 'ugc'

/** Write → wait for the device → "✓ · Desfazer" (or say it could NOT save; nothing changes then). */
export function commit(write: () => Undo, message: string): Promise<boolean> {
  return saveConfirmed(write, (undo) => undo()).then((r) => {
    if (!r.ok) {
      toast(SAVE_FAILED)
      return false
    }
    haptic('success')
    toast(message, {
      action: {
        label: 'Desfazer',
        run: () => {
          r.value()
          void persist()
        },
      },
    })
    return true
  })
}

/** Today's rows of a kind, still open (same projection as the Home's Hoje list). */
function openToday(db: DB, today: DateKey, kind: ActionItem['check']): ActionItem[] {
  const hidden = { carreira: areaLocked(db.profile.privacyLock, 'carreira'), dinheiro: areaLocked(db.profile.privacyLock, 'dinheiro') }
  return dayItems(db, today, today, { hidden }).filter((i) => i.check === kind && i.status !== 'done' && i.status !== 'cancelled' && i.status !== 'skipped')
}

function go<N extends SheetName>(name: N, props?: SheetProps<N>) {
  return () => {
    haptic('light')
    replaceSheet(name, props)
  }
}

const OTHERS: { label: string; open: () => void }[] = [
  { label: 'Inbox', open: go('brainDump') },
  { label: 'Nota', open: go('note', { kind: 'nota' }) },
  { label: 'Ideia', open: go('note', { kind: 'ideia' }) },
  { label: 'Compromisso', open: go('event') },
  { label: 'Meta', open: go('goal') },
  { label: 'Estudo', open: go('study') },
  { label: 'Livro', open: go('book') },
  { label: 'Conteúdo', open: go('content') },
  { label: 'Compra planejada', open: go('expense', { defaults: { status: 'planned_purchase' } }) },
  { label: 'Viagem', open: go('trip') },
  { label: 'Esperando', open: go('task', { defaults: { status: 'waiting' } }) },
  { label: 'Win', open: go('win') },
  { label: 'Check-in do corpo', open: go('checkin') },
]

export default function QuickAddSheet() {
  const [view, setView] = useState<View>('menu')
  const back = () => setView('menu')
  switch (view) {
    case 'tarefa':
      return <TaskForm onBack={back} />
    case 'despesa':
      return <ExpenseForm onBack={back} />
    case 'treino':
      return <WorkoutForm onBack={back} />
    case 'refeicao':
      return <MealForm onBack={back} />
    case 'pagamento':
      return <BillForm onBack={back} />
    case 'sono':
      return <SleepForm onBack={back} />
    case 'humor':
      return <MoodForm onBack={back} />
    case 'ugc':
      return <BrandForm onBack={back} />
    default:
      return <Menu onPick={setView} />
  }
}

// ─── Frame ──────────────────────────────────────────────────────────────────

/** Header (back · title · close), scrollable body, primary button pinned at the bottom (above the keyboard). */
function Frame({ title, onBack, children, primary }: { title: string; onBack?: () => void; children: ReactNode; primary?: { label: string; onClick: () => void; disabled?: boolean } }) {
  return (
    <>
      <div className="flex items-center gap-1 px-3 pb-2 min-h-12">
        {onBack ? (
          <IconButton label="Voltar" onClick={onBack}>
            <ChevronLeft size={22} />
          </IconButton>
        ) : (
          <span className="w-2" />
        )}
        <h2 className="font-display text-[1.375rem] leading-tight flex-1 truncate">{title}</h2>
        <IconButton label="Fechar" onClick={closeSheet}>
          <X size={20} />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4 space-y-4">{children}</div>
      {primary && (
        <div className="px-5 pt-3 border-t border-line/70" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          <Button variant="primary" size="lg" onClick={primary.onClick} disabled={primary.disabled} className="disabled:opacity-40">
            {primary.label}
          </Button>
        </div>
      )}
    </>
  )
}

/** A quiet, 56px tappable row: icon · label · hint · chevron (or a trailing action). */
function ChoiceRow({ icon, label, hint, onClick, trailing, ariaLabel }: { icon: ReactNode; label: string; hint?: string; onClick: () => void; trailing?: ReactNode; ariaLabel?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className="w-full min-h-14 flex items-center gap-3.5 py-2 text-left active:bg-surface-2 rounded-xl -mx-2 px-2 transition-colors">
      <span aria-hidden className="h-10 w-10 shrink-0 rounded-full bg-surface-2 text-ink-2 inline-flex items-center justify-center">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[1rem] text-ink leading-tight">{label}</span>
        {hint && <span className="block text-[0.8125rem] text-muted leading-snug mt-0.5 truncate">{hint}</span>}
      </span>
      {trailing ?? <ChevronRight size={18} className="text-muted shrink-0" aria-hidden />}
    </button>
  )
}

/** "Fiz" rows for what was planned today: one tap = the Home's own check. */
function PlannedRows({ items, verb, onDone }: { items: ActionItem[]; verb: string; onDone: () => void }) {
  if (!items.length) return null
  return (
    <ul className="divide-y divide-line/70 -mt-1">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-3 min-h-14 py-1.5">
          <div className="flex-1 min-w-0">
            <div className="text-[1rem] text-ink leading-tight truncate">{it.title}</div>
            {(it.start || it.sub) && <div className="text-[0.8125rem] text-muted truncate">{[it.start, it.sub?.split(' · ')[0]].filter(Boolean).join(' · ')}</div>}
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              checkItem(it)
              onDone()
            }}
            aria-label={`${verb}: ${it.title}`}
          >
            {verb}
          </Button>
        </li>
      ))}
    </ul>
  )
}

const BIG_CHIP = 'h-11 px-4 text-[0.9375rem]'

// ─── Menu ───────────────────────────────────────────────────────────────────

function Menu({ onPick }: { onPick: (v: View) => void }) {
  const db = useDB()
  const today = useToday()
  const nav = useNavigate()
  useLockState()
  const workouts = useMemo(() => openToday(db, today, 'workout'), [db, today])
  const meals = useMemo(() => openToday(db, today, 'meal'), [db, today])
  const bills = useMemo(() => openToday(db, today, 'bill'), [db, today])
  const glasses = db.checkins.find((c) => c.date === today)?.habits.agua ?? 0
  const goal = Math.max(1, db.profile.waterGoal || 8)
  const pick = (v: View) => () => {
    haptic('light')
    onPick(v)
  }
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return (
    <Frame title="Registrar">
      <div className="-mt-1">
        <ChoiceRow icon={<ListChecks size={19} />} label="Tarefa" hint="título, dia, área" onClick={pick('tarefa')} />
        <ChoiceRow icon={<Receipt size={19} />} label="Despesa" hint="valor e categoria" onClick={pick('despesa')} />
        <ChoiceRow icon={<Dumbbell size={19} />} label="Treino feito" hint={workouts.length ? `${plural(workouts.length, 'planejado', 'planejados')} hoje · ou outro` : 'tipo e duração'} onClick={pick('treino')} />
        <ChoiceRow icon={<Utensils size={19} />} label="Refeição" hint={meals.length ? `${plural(meals.length, 'do plano', 'do plano')} em aberto · ou livre` : 'o que você comeu'} onClick={pick('refeicao')} />
        <ChoiceRow icon={<CreditCard size={19} />} label="Pagamento" hint={bills.length ? `${plural(bills.length, 'conta vencendo', 'contas vencendo')}` : 'nada vencendo hoje'} onClick={pick('pagamento')} />
        <ChoiceRow
          icon={<Droplet size={19} />}
          label="Água"
          hint={`${glasses} de ${goal} copos hoje`}
          ariaLabel={`Mais um copo de água (${glasses} de ${goal})`}
          onClick={() => void commit(() => addWater(today).undo, `Água: ${glasses + 1} de ${goal} ✓`)}
          trailing={<span className="text-[0.875rem] font-semibold text-ink tabular-nums shrink-0 rounded-full bg-surface-2 h-11 px-3.5 inline-flex items-center">+250 ml</span>}
        />
        <ChoiceRow icon={<Moon size={19} />} label="Sono" hint="horários ou horas · qualidade" onClick={pick('sono')} />
        <ChoiceRow icon={<Smile size={19} />} label="Humor" hint="como você está agora" onClick={pick('humor')} />
        <ChoiceRow icon={<Store size={19} />} label="Marca UGC" hint="nome da marca" onClick={pick('ugc')} />
      </div>
      <MoreOptions label="outros registros">
        <div className="flex flex-wrap gap-2">
          {OTHERS.map((o) => (
            <Chip key={o.label} className={BIG_CHIP} onClick={o.open}>
              {o.label}
            </Chip>
          ))}
        </div>
      </MoreOptions>
      <button
        type="button"
        onClick={() => {
          haptic('light')
          closeSheet()
          nav(ROUTES.assistant)
        }}
        className="w-full min-h-11 flex items-center gap-2 text-[0.875rem] text-muted"
      >
        <Sparkles size={15} aria-hidden /> ou conte pra Lumos, ela guarda no lugar certo
      </button>
    </Frame>
  )
}

// ─── Tarefa ─────────────────────────────────────────────────────────────────

type DayChoice = 'hoje' | 'amanha' | 'outro' | 'sem'

function TaskForm({ onBack }: { onBack: () => void }) {
  const today = useToday()
  const [title, setTitle] = useState('')
  const [day, setDay] = useState<DayChoice>('hoje')
  const [other, setOther] = useState<DateKey | undefined>(addDays(today, 2))
  const [time, setTime] = useState<string | undefined>()
  const [area, setArea] = useState<QuickArea>('vida')
  const [notes, setNotes] = useState('')
  const date = day === 'hoje' ? today : day === 'amanha' ? addDays(today, 1) : day === 'outro' ? other : undefined
  const save = () => {
    if (!title.trim()) return
    closeSheet()
    void commit(() => quickTask({ title, date, time: date ? time : undefined, area, notes }).undo, `${title.trim()} ✓${date && date !== today ? ` · ${formatDayMonth(date)}` : ''}`)
  }
  return (
    <Frame title="Tarefa" onBack={onBack} primary={{ label: 'Salvar tarefa', onClick: save, disabled: !title.trim() }}>
      <TitleInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ser feito?" aria-label="Título da tarefa" onKeyDown={(e) => e.key === 'Enter' && save()} />
      <Field label="Dia">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['hoje', 'Hoje'],
              ['amanha', 'Amanhã'],
              ['outro', 'Outro dia'],
              ['sem', 'Sem dia'],
            ] as const
          ).map(([v, l]) => (
            <Chip key={v} className={BIG_CHIP} selected={day === v} onClick={() => setDay(v)}>
              {l}
            </Chip>
          ))}
        </div>
        {day === 'outro' && <DateInput className="mt-2" value={other} onChange={setOther} aria-label="Data" />}
      </Field>
      <Field label="Área">
        <div className="flex flex-wrap gap-2">
          {QUICK_AREAS.map((a) => (
            <Chip key={a.value} className={BIG_CHIP} selected={area === a.value} onClick={() => setArea(a.value)}>
              {a.label}
            </Chip>
          ))}
        </div>
      </Field>
      <MoreOptions label="mais">
        {date && (
          <Field label="Hora (opcional)">
            <TimeInput value={time} onChange={setTime} aria-label="Hora" />
          </Field>
        )}
        <Field label="Nota">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opcional" />
        </Field>
      </MoreOptions>
    </Frame>
  )
}

// ─── Despesa ────────────────────────────────────────────────────────────────

function ExpenseForm({ onBack }: { onBack: () => void }) {
  const db = useDB()
  const today = useToday()
  const cats = useMemo(() => categoriesByUsage(db.financialCategories, db.expenses).filter((c) => c.id !== INCOME_CATEGORY_ID), [db.financialCategories, db.expenses])
  const [amount, setAmount] = useState<number | undefined>()
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>()
  const [all, setAll] = useState(false)
  const [date, setDate] = useState<DateKey | undefined>(today)
  const shown = all ? cats : cats.slice(0, 6)
  const cat = categoryId ?? cats[0]?.id
  const ok = !!amount && amount > 0 && !!cat
  const save = () => {
    if (!ok) return
    closeSheet()
    void commit(() => quickExpense({ amountCents: amount!, title, categoryId: cat!, date: date ?? today }).undo, 'Despesa anotada ✓')
  }
  return (
    <Frame title="Despesa" onBack={onBack} primary={{ label: 'Salvar despesa', onClick: save, disabled: !ok }}>
      <Field label="Valor">
        <MoneyInput large autoFocus valueCents={amount} onChange={setAmount} />
      </Field>
      <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Descrição (opcional)" aria-label="Descrição" />
      <Field label="Categoria">
        <div className="flex flex-wrap gap-2">
          {shown.map((c) => (
            <Chip key={c.id} className={BIG_CHIP} selected={cat === c.id} onClick={() => setCategoryId(c.id)}>
              {c.emoji ? `${c.emoji} ` : ''}
              {c.name}
            </Chip>
          ))}
          {!all && cats.length > 6 && (
            <Chip className={BIG_CHIP} onClick={() => setAll(true)}>
              mais…
            </Chip>
          )}
        </div>
      </Field>
      <MoreOptions label="mais">
        <Field label="Data">
          <DateInput value={date} onChange={setDate} aria-label="Data" />
        </Field>
      </MoreOptions>
    </Frame>
  )
}

// ─── Treino ─────────────────────────────────────────────────────────────────

function WorkoutForm({ onBack }: { onBack: () => void }) {
  const db = useDB()
  const today = useToday()
  useLockState()
  const planned = useMemo(() => openToday(db, today, 'workout'), [db, today])
  const mods = useMemo(() => orderedModalities(db.profile.modalities).slice(0, 8), [db.profile.modalities])
  const [modality, setModality] = useState<string | undefined>()
  const [minutes, setMinutes] = useState<number | undefined>(45)
  const save = () => {
    if (!modality) return
    const label = mods.find((m) => m.id === modality)?.label ?? 'Treino'
    closeSheet()
    void commit(() => quickWorkout({ modality, durationMin: minutes, date: today }).undo, `${label} feito ✓`)
  }
  return (
    <Frame title="Treino feito" onBack={onBack} primary={{ label: 'Salvar treino', onClick: save, disabled: !modality }}>
      {planned.length > 0 && (
        <>
          <div className="eyebrow">planejado hoje</div>
          <PlannedRows items={planned} verb="Fiz" onDone={closeSheet} />
          <div className="eyebrow pt-2">ou outro treino</div>
        </>
      )}
      <Field label="Tipo">
        <div className="flex flex-wrap gap-2">
          {mods.map((m) => (
            <Chip key={m.id} className={BIG_CHIP} selected={modality === m.id} onClick={() => setModality(m.id)}>
              <span aria-hidden>{m.emoji}</span> {m.label}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Duração (min)">
        <NumberInput value={minutes} onChange={setMinutes} inputMode="numeric" aria-label="Duração em minutos" />
      </Field>
    </Frame>
  )
}

// ─── Refeição ───────────────────────────────────────────────────────────────

function MealForm({ onBack }: { onBack: () => void }) {
  const db = useDB()
  const today = useToday()
  const planned = useMemo(() => openToday(db, today, 'meal'), [db, today])
  const [text, setText] = useState('')
  const save = () => {
    if (!text.trim()) return
    closeSheet()
    void commit(() => quickMeal({ text: text.trim(), date: today }).undo, 'Refeição anotada ✓')
  }
  return (
    <Frame title="Refeição" onBack={onBack} primary={{ label: 'Registrar refeição', onClick: save, disabled: !text.trim() }}>
      {planned.length > 0 && (
        <>
          <div className="eyebrow">do plano, hoje</div>
          <PlannedRows items={planned} verb="Comi" onDone={closeSheet} />
          <div className="eyebrow pt-2">ou outra coisa</div>
        </>
      )}
      <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="O que você comeu?" aria-label="O que você comeu" onKeyDown={(e) => e.key === 'Enter' && save()} autoFocus={!planned.length} />
    </Frame>
  )
}

// ─── Pagamento ──────────────────────────────────────────────────────────────

function BillForm({ onBack }: { onBack: () => void }) {
  const db = useDB()
  const today = useToday()
  useLockState()
  const bills = useMemo(() => openToday(db, today, 'bill'), [db, today])
  return (
    <Frame title="Pagamento" onBack={onBack}>
      {bills.length ? (
        <PlannedRows items={bills} verb="Já paguei" onDone={closeSheet} />
      ) : (
        <p className="text-[0.9375rem] text-ink-2 py-2">Nenhuma conta vencendo hoje.</p>
      )}
      <Button
        variant="outline"
        block
        onClick={() => {
          haptic('light')
          replaceSheet('expense')
        }}
      >
        Anotar um gasto avulso
      </Button>
    </Frame>
  )
}

// ─── Sono ───────────────────────────────────────────────────────────────────

type Q = 1 | 2 | 3 | 4 | 5

function Scale({ value, onChange, label, options }: { value?: Q; onChange: (v: Q) => void; label: string; options: { value: Q; label: string; text?: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.text ?? o.label}
          onClick={() => onChange(o.value)}
          className={cn('min-h-14 rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition active:scale-[0.97]', value === o.value ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink-2')}
        >
          <span className="text-[1.25rem] leading-none">{o.label}</span>
          {o.text && <span className="text-[0.6875rem] leading-tight">{o.text}</span>}
        </button>
      ))}
    </div>
  )
}

const QUALITY: { value: Q; label: string; text: string }[] = [
  { value: 1, label: '1', text: 'péssimo' },
  { value: 2, label: '2', text: 'ruim' },
  { value: 3, label: '3', text: 'ok' },
  { value: 4, label: '4', text: 'bom' },
  { value: 5, label: '5', text: 'ótimo' },
]

function SleepForm({ onBack }: { onBack: () => void }) {
  const today = useToday()
  const db = useDB()
  const existing = db.checkins.find((c) => c.date === today)?.sleep
  const [mode, setMode] = useState<'horarios' | 'horas'>(existing?.hours && !existing.bed ? 'horas' : 'horarios')
  const [bed, setBed] = useState<string | undefined>(existing?.bed ?? '23:00')
  const [wake, setWake] = useState<string | undefined>(existing?.wake ?? '07:00')
  const [hours, setHours] = useState<number | undefined>(existing?.hours ?? 7)
  const [quality, setQuality] = useState<Q | undefined>(existing?.quality)
  const ok = mode === 'horarios' ? !!bed && !!wake : !!hours && hours > 0 && hours < 24
  const save = () => {
    if (!ok) return
    closeSheet()
    void commit(() => quickSleep(mode === 'horarios' ? { date: today, bed, wake, quality } : { date: today, hours, quality }), 'Sono anotado ✓')
  }
  return (
    <Frame title="Sono" onBack={onBack} primary={{ label: 'Salvar sono', onClick: save, disabled: !ok }}>
      <Segmented
        value={mode}
        onChange={(v) => v && setMode(v)}
        options={[
          { value: 'horarios', label: 'Horários' },
          { value: 'horas', label: 'Horas' },
        ]}
      />
      {mode === 'horarios' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deitei">
            <TimeInput value={bed} onChange={setBed} aria-label="Hora que deitou" />
          </Field>
          <Field label="Acordei">
            <TimeInput value={wake} onChange={setWake} aria-label="Hora que acordou" />
          </Field>
        </div>
      ) : (
        <Field label="Horas dormidas">
          <NumberInput value={hours} onChange={setHours} inputMode="decimal" step="0.5" aria-label="Horas dormidas" />
        </Field>
      )}
      <Field label="Qualidade">
        <Scale value={quality} onChange={setQuality} label="Qualidade do sono" options={QUALITY} />
      </Field>
      <WeekLine />
    </Frame>
  )
}

// ─── Humor ──────────────────────────────────────────────────────────────────

function MoodForm({ onBack }: { onBack: () => void }) {
  const today = useToday()
  const db = useDB()
  const existing = db.checkins.find((c) => c.date === today)
  const [humor, setHumor] = useState<Q | undefined>(existing?.humor)
  const [nota, setNota] = useState('')
  const save = () => {
    if (!humor) return
    closeSheet()
    void commit(() => quickMood({ date: today, humor, nota }), 'Humor anotado ✓')
  }
  return (
    <Frame title="Humor" onBack={onBack} primary={{ label: 'Salvar humor', onClick: save, disabled: !humor }}>
      <Scale value={humor} onChange={setHumor} label="Humor" options={MOODS.map((m) => ({ value: m.value, label: m.emoji, text: m.label }))} />
      <TextInput value={nota} onChange={(e) => setNota(e.target.value)} placeholder="uma nota (opcional)" aria-label="Nota" />
      <WeekLine />
    </Frame>
  )
}

/** Last 7 days of sleep + mood, one quiet line (the full list lives in Corpo → Histórico). */
function WeekLine() {
  const db = useDB()
  const today = useToday()
  const w = useMemo(() => sleepMoodWeek(db.checkins, today, addDays(today, -6)), [db.checkins, today])
  if (!w.days.length) return null
  const bits = [w.avgHours && `${String(w.avgHours).replace('.', ',')} h de sono`, w.avgQuality && `qualidade ${String(w.avgQuality).replace('.', ',')}`, w.avgHumor && `humor ${String(w.avgHumor).replace('.', ',')}`].filter(Boolean)
  return (
    <button type="button" onClick={() => (closeSheet(), openSheet('checkin'))} className="w-full text-left text-[0.8125rem] text-muted min-h-11">
      Média dos últimos 7 dias: {bits.join(' · ')}
    </button>
  )
}

// ─── Marca UGC ──────────────────────────────────────────────────────────────

function BrandForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('')
  const save = () => {
    const n = name.trim()
    if (!n) return
    closeSheet()
    void commit(() => quickBrand(n).undo, `${n} no radar de UGC ✓`)
  }
  return (
    <Frame title="Marca UGC" onBack={onBack} primary={{ label: 'Adicionar marca', onClick: save, disabled: !name.trim() }}>
      <TitleInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da marca" aria-label="Nome da marca" onKeyDown={(e) => e.key === 'Enter' && save()} />
      <p className="text-[0.8125rem] text-muted">Entra como prospect no seu CRM de UGC (sem duplicar se já existir).</p>
    </Frame>
  )
}
