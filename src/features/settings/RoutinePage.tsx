/**
 * Ajustes → Rotina: the day's routine mode (automatic, or switched by hand for a while) and the base day
 * (editable background blocks shown in the Agenda). Everything is saved in the profile, with Desfazer.
 */
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { Button, Card, ChipSelect, DateInput, ListCard, MultiChipSelect, Page, PageHeader, SectionTitle, Segmented, TextInput, TimeInput } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { DateKey, DayBlock, RoutineMode, UserProfile } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { uid } from '@/lib/id'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { WEEKDAY_SHORT } from '@/lib/date'
import {
  blockModes,
  DAY_BLOCK_CATEGORIES,
  DAY_BLOCK_CATEGORY_META,
  removeBlock,
  ROUTINE_MODE_META,
  ROUTINE_MODE_ORDER,
  routineModeLine,
  routineModeToday,
  upsertBlock,
  validBlock,
  withManualMode,
  withoutManualMode,
} from '@/data/routine-modes'
import { Hint } from './components'

const label = 'block text-[13px] font-medium text-ink-2 mb-1.5 px-0.5'
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const dm = (d: DateKey) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** Saves a profile patch with a Desfazer that puts the previous values back. */
function saveWithUndo(patch: Partial<UserProfile>, prev: Partial<UserProfile>, message: string) {
  actions.setProfile(patch)
  haptic('light')
  toast(message, { action: { label: 'Desfazer', run: () => actions.setProfile(prev) } })
}

export default function RoutinePage() {
  return (
    <Page>
      <PageHeader title="Rotina" back backTo={ROUTES.settings} search={false} subtitle="Modo do dia e o seu dia base." />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <ModeSection />
        <BlocksSection />
      </motion.div>
    </Page>
  )
}

// ─── Modo ───────────────────────────────────────────────────────────────────

function ModeSection() {
  const profile = useDB((db) => db.profile)
  const trips = useDB((db) => db.trips)
  const info = useMemo(() => routineModeToday({ profile, trips }), [profile, trips])
  const meta = ROUTINE_MODE_META[info.mode]
  const manual = profile.routineModes?.manual
  const [mode, setMode] = useState<RoutineMode>(info.mode)
  const [from, setFrom] = useState<DateKey>(info.date)
  const [to, setTo] = useState<DateKey | undefined>(undefined)
  const periods = profile.routineModes?.periods ?? []

  const apply = () => {
    const start = from || info.date
    saveWithUndo({ routineModes: withManualMode(profile, mode, start, to) }, { routineModes: profile.routineModes }, `Modo ${ROUTINE_MODE_META[mode].label}${to ? ` até ${dm(to)}` : ''} ✓`)
  }
  const backToAuto = () => saveWithUndo({ routineModes: withoutManualMode(profile) }, { routineModes: profile.routineModes }, 'De volta ao automático')

  return (
    <>
      <SectionTitle className="mt-2">Modo de hoje</SectionTitle>
      <Card>
        <div className="flex items-start gap-3">
          <span aria-hidden className="text-[24px] leading-none mt-0.5">
            {meta.emoji}
          </span>
          <div className="min-w-0">
            <div className="text-[15.5px] font-medium">{routineModeLine(info)}</div>
            <p className="text-[13px] text-muted leading-snug mt-0.5">{meta.hint}</p>
          </div>
        </div>
        {manual && (
          <Button variant="soft" size="sm" className="mt-3" onClick={backToAuto}>
            Voltar ao automático
          </Button>
        )}
      </Card>

      <div className="text-[13px] font-medium text-ink-2 mt-5 mb-2 px-1">Mudar o modo</div>
      <Card className="space-y-4">
        <ChipSelect
          value={mode}
          onChange={(v) => v && setMode(v)}
          options={ROUTINE_MODE_ORDER.map((m) => ({ value: m, label: `${ROUTINE_MODE_META[m].emoji} ${ROUTINE_MODE_META[m].label}` }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={label}>De</span>
            <DateInput aria-label="Início do modo" value={from} onChange={(v) => v && setFrom(v)} />
          </label>
          <label className="block">
            <span className={label}>Até (opcional)</span>
            <DateInput aria-label="Fim do modo" value={to} min={from} onChange={setTo} />
          </label>
        </div>
        <Button className="w-full" onClick={apply}>
          Usar modo {ROUTINE_MODE_META[mode].label}
        </Button>
      </Card>
      <Hint>
        Sem nada marcado, o modo é automático: dias de viagem são Viagem, o resto é Brasil. Uma mudança manual vale mais que tudo enquanto durar.
      </Hint>

      {periods.length > 0 && (
        <>
          <div className="text-[13px] font-medium text-ink-2 mt-5 mb-2 px-1">Períodos</div>
          <ListCard>
            {periods.map((p, i) => (
              <div key={`${p.mode}-${p.from}-${i}`} className="flex items-center gap-3 min-h-[52px] px-4 py-2">
                <span aria-hidden className="text-[18px]">
                  {ROUTINE_MODE_META[p.mode].emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] truncate">{p.label ?? ROUTINE_MODE_META[p.mode].label}</div>
                  <div className="text-[12.5px] text-muted">
                    {ROUTINE_MODE_META[p.mode].label} · {dm(p.from)}
                    {p.to ? ` – ${dm(p.to)}` : ' em diante'}
                  </div>
                </div>
              </div>
            ))}
          </ListCard>
        </>
      )}
    </>
  )
}

// ─── Dia base ───────────────────────────────────────────────────────────────

const daysLabel = (days: number[]) => {
  const s = new Set(days)
  if (s.size === 7) return 'todo dia'
  if (s.size === 5 && [1, 2, 3, 4, 5].every((d) => s.has(d))) return 'seg–sex'
  if (s.size === 2 && s.has(0) && s.has(6)) return 'fim de semana'
  return DAY_ORDER.filter((d) => s.has(d)).map((d) => WEEKDAY_SHORT[d].toLowerCase()).join(' · ')
}

const newBlock = (): DayBlock => ({ id: `block-${uid()}`, title: '', category: 'pessoal', weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '10:00', modes: ['brasil'], kind: 'base' })

function BlocksSection() {
  const dayPlan = useDB((db) => db.profile.dayPlan)
  const blocks = useMemo(() => dayPlan?.blocks ?? [], [dayPlan])
  const [editing, setEditing] = useState<DayBlock>()
  const sorted = useMemo(() => [...blocks].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title)), [blocks])

  const save = (b: DayBlock) => {
    const isNew = !blocks.some((x) => x.id === b.id)
    saveWithUndo({ dayPlan: { blocks: upsertBlock(blocks, { ...b, title: b.title.trim(), note: b.note?.trim() || undefined }) } }, { dayPlan }, isNew ? 'Bloco adicionado ✓' : 'Bloco salvo ✓')
    setEditing(undefined)
  }
  const remove = (b: DayBlock) => {
    saveWithUndo({ dayPlan: { blocks: removeBlock(blocks, b.id) } }, { dayPlan }, 'Bloco removido')
    setEditing(undefined)
  }

  return (
    <>
      <SectionTitle
        action={
          !editing && (
            <Button variant="soft" size="sm" icon={<Plus size={15} />} onClick={() => setEditing(newBlock())}>
              Bloco
            </Button>
          )
        }
      >
        Dia base
      </SectionTitle>
      {editing && !blocks.some((b) => b.id === editing.id) && <BlockEditor value={editing} onChange={setEditing} onSave={save} onCancel={() => setEditing(undefined)} />}
      {sorted.length > 0 ? (
        <ListCard>
          {sorted.map((b) =>
            editing?.id === b.id ? (
              <div key={b.id} className="p-2">
                <BlockEditor value={editing} onChange={setEditing} onSave={save} onCancel={() => setEditing(undefined)} onRemove={() => remove(b)} />
              </div>
            ) : (
              <button key={b.id} type="button" onClick={() => setEditing(b)} className="w-full flex items-center gap-3 min-h-[60px] px-4 py-2 text-left active:bg-surface-2">
                <span aria-hidden className="text-[18px]">
                  {DAY_BLOCK_CATEGORY_META[b.category]?.emoji ?? '•'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] truncate">{b.title}</div>
                  <div className="text-[12.5px] text-muted truncate">
                    {b.start}–{b.end} · {daysLabel(b.weekdays)} · {blockModes(b).map((m) => ROUTINE_MODE_META[m].label).join(', ')}
                  </div>
                </div>
                <span className={cn('shrink-0 text-[11px] px-2 h-[20px] inline-flex items-center rounded-full', b.kind === 'sugerido' ? 'border border-dashed border-line text-muted' : 'bg-surface-2 text-ink-2')}>
                  {b.kind === 'sugerido' ? 'sugerido' : 'base'}
                </span>
              </button>
            ),
          )}
        </ListCard>
      ) : (
        !editing && (
          <Card>
            <p className="text-[13.5px] text-muted leading-snug">Nenhum bloco ainda. O dia base aparece na Agenda como fundo: ritual, almoço, estudo, idiomas…</p>
          </Card>
        )
      )}
      <Hint>Base fica de fundo na Agenda e nunca vira conflito. Sugerido some do dia quando algo real ocupa o horário. Nada disso aparece na lista do Início.</Hint>
    </>
  )
}

function BlockEditor({ value: b, onChange, onSave, onCancel, onRemove }: { value: DayBlock; onChange: (b: DayBlock) => void; onSave: (b: DayBlock) => void; onCancel: () => void; onRemove?: () => void }) {
  const set = (patch: Partial<DayBlock>) => onChange({ ...b, ...patch })
  const ok = validBlock(b)
  return (
    <Card className="space-y-4" aria-label="Editar bloco">
      <label className="block">
        <span className={label}>Título</span>
        <TextInput value={b.title} placeholder="Ex.: Inglês" onChange={(e) => set({ title: e.target.value })} enterKeyHint="done" />
      </label>
      <div>
        <span className={label}>Categoria</span>
        <ChipSelect
          value={b.category}
          onChange={(v) => v && set({ category: v })}
          options={DAY_BLOCK_CATEGORIES.map((c) => ({ value: c, label: `${DAY_BLOCK_CATEGORY_META[c].emoji} ${DAY_BLOCK_CATEGORY_META[c].label}` }))}
        />
      </div>
      <div>
        <span className={label}>Dias</span>
        <MultiChipSelect
          value={b.weekdays.map(String)}
          onChange={(v) => set({ weekdays: v.map(Number).sort() })}
          options={DAY_ORDER.map((d) => ({ value: String(d), label: WEEKDAY_SHORT[d].toLowerCase() }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={label}>Início</span>
          <TimeInput aria-label="Início do bloco" value={b.start} onChange={(v) => v && set({ start: v })} />
        </div>
        <div>
          <span className={label}>Fim</span>
          <TimeInput aria-label="Fim do bloco" value={b.end} onChange={(v) => v && set({ end: v })} />
        </div>
      </div>
      <div>
        <span className={label}>Tipo</span>
        <Segmented
          value={b.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: 'base', label: 'Base' },
            { value: 'sugerido', label: 'Sugerido' },
          ]}
        />
      </div>
      <div>
        <span className={label}>Modos</span>
        <MultiChipSelect
          value={blockModes(b)}
          onChange={(modes) => set({ modes: modes.length ? modes : ['brasil'] })}
          options={ROUTINE_MODE_ORDER.map((m) => ({ value: m, label: `${ROUTINE_MODE_META[m].emoji} ${ROUTINE_MODE_META[m].label}` }))}
        />
      </div>
      <label className="block">
        <span className={label}>Nota (opcional)</span>
        <TextInput value={b.note ?? ''} onChange={(e) => set({ note: e.target.value })} enterKeyHint="done" />
      </label>
      {!ok && b.title.trim() && <p className="text-[12.5px] text-accent px-0.5">O fim precisa ser depois do início, com pelo menos um dia.</p>}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!ok} onClick={() => onSave(b)}>
          Salvar
        </Button>
        <Button variant="soft" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      {onRemove && (
        <Button variant="ghost" size="sm" className="text-accent" onClick={onRemove}>
          Remover bloco
        </Button>
      )}
    </Card>
  )
}
