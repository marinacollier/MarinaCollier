import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Card, IconButton, ListCard, SectionTitle, TextArea, TextInput, TimeInput } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { Weekday, WorkDayMode, WorkSchedule } from '@/data/types'
import { toast } from '@/app/ui-store'
import { WEEKDAY_LONG } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { Hint, Stepper } from './components'
import { WORK_MODE_OPTIONS, normalizeChecklist, setWorkDay } from './profileEdit'

const label = 'block text-[13px] font-medium text-ink-2 mb-1.5 px-0.5'

/** Meu ritmo — wake/sleep base times. */
export function RhythmSection() {
  const rhythm = useDB((db) => db.profile.rhythm)
  const set = (patch: Partial<typeof rhythm>) => actions.setProfile({ rhythm: { ...rhythm, ...patch } })
  return (
    <>
      <SectionTitle>Meu ritmo</SectionTitle>
      <Card>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>☀️ Acordar</span>
            <TimeInput aria-label="Horário base de acordar" value={rhythm.wakeTime} onChange={(v) => v && set({ wakeTime: v })} />
          </div>
          <div>
            <span className={label}>🌙 Dormir</span>
            <TimeInput aria-label="Horário base de dormir" value={rhythm.sleepTime} onChange={(v) => v && set({ sleepTime: v })} />
          </div>
        </div>
      </Card>
      <Hint>É base, não regra — se acordar mais tarde, o dia se adapta.</Hint>
    </>
  )
}

/** Sobre mim — home base + a few lines of context. */
export function AboutSection() {
  const profile = useDB((db) => db.profile)
  const [homeBase, setHomeBase] = useState(profile.homeBase ?? '')
  const [about, setAbout] = useState(profile.about ?? '')
  const save = (patch: { homeBase?: string; about?: string }) => {
    const key = Object.keys(patch)[0] as 'homeBase' | 'about'
    const v = patch[key]?.trim() || undefined
    if (v === profile[key]) return
    actions.setProfile({ [key]: v })
    toast('Salvo ✓')
  }
  return (
    <>
      <SectionTitle>Sobre mim</SectionTitle>
      <Card className="space-y-4">
        <label className="block">
          <span className={label}>Onde é sua base</span>
          <TextInput value={homeBase} placeholder="Cidade" onChange={(e) => setHomeBase(e.target.value)} onBlur={() => save({ homeBase })} enterKeyHint="done" onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        </label>
        <label className="block">
          <span className={label}>Seu momento, em poucas linhas</span>
          <TextArea value={about} rows={4} placeholder="O que você faz, o que tá rolando agora…" onChange={(e) => setAbout(e.target.value)} onBlur={() => save({ about })} />
        </label>
      </Card>
      <Hint>Ajuda a Mari e as sugestões a entenderem seu contexto. Fica só no seu aparelho.</Hint>
    </>
  )
}

const DAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

/** Trabalho — base hours, per-weekday mode, location, commute buffers and the presencial checklist. */
export function WorkSection() {
  const work = useDB((db) => db.profile.work)
  const set = (patch: Partial<WorkSchedule>) => actions.setProfile({ work: { ...work, ...patch } })
  const [location, setLocation] = useState(work.location ?? '')
  const [newItem, setNewItem] = useState('')

  const addItem = () => {
    const next = normalizeChecklist([...work.presencialChecklist, newItem])
    if (next.length !== work.presencialChecklist.length) {
      set({ presencialChecklist: next })
      haptic('light')
    }
    setNewItem('')
  }

  return (
    <>
      <SectionTitle>Trabalho</SectionTitle>
      <Card>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>Começo</span>
            <TimeInput aria-label="Começo do trabalho" value={work.start} onChange={(v) => v && set({ start: v })} />
          </div>
          <div>
            <span className={label}>Fim</span>
            <TimeInput aria-label="Fim do trabalho" value={work.end} onChange={(v) => v && set({ end: v })} />
          </div>
        </div>
        <p className="text-[12.5px] text-muted mt-2 px-0.5">Horário base, não um bloqueio. A agenda e o planner usam como referência.</p>
      </Card>

      <div className="text-[13px] font-medium text-ink-2 mt-5 mb-2 px-1">Cada dia da semana</div>
      <ListCard>
        {DAY_ORDER.map((d) => (
          <div key={d} className="flex items-center gap-2 min-h-[56px] px-3.5 py-2">
            <span className="w-10 shrink-0 text-[14px] capitalize">{WEEKDAY_LONG[d].slice(0, 3)}</span>
            <div className="flex-1 flex gap-1 justify-end" role="radiogroup" aria-label={`Modo de ${WEEKDAY_LONG[d]}`}>
              {WORK_MODE_OPTIONS.map((o) => {
                const on = work.days[d] === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      haptic('light')
                      set({ days: setWorkDay(work.days, d, o.value as WorkDayMode) })
                    }}
                    className={cn(
                      'h-9 px-2 rounded-full text-[12px] border whitespace-nowrap transition active:scale-[0.97]',
                      on ? (o.value === 'presencial' ? 'bg-accent text-white border-accent' : 'bg-ink text-bg border-ink') : 'bg-surface border-line text-ink-2',
                    )}
                  >
                    {o.short}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </ListCard>
      <Hint>Dia presencial deixa o planner mais cuidadoso: evita treino de logística pesada e lembra de preparar as coisas na noite anterior.</Hint>

      <SectionTitle>Dias presenciais</SectionTitle>
      <Card>
        <label className="block">
          <span className={label}>Local</span>
          <TextInput value={location} placeholder="Onde fica o escritório" onChange={(e) => setLocation(e.target.value)} onBlur={() => set({ location: location.trim() || undefined })} enterKeyHint="done" onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        </label>
        <div className="mt-4 space-y-1">
          <div className="flex items-center justify-between gap-3 min-h-[52px]">
            <div>
              <div className="text-[15px]">Deslocamento antes</div>
              <div className="text-[12.5px] text-muted">minutos de ida</div>
            </div>
            <Stepper label="deslocamento antes" value={Math.round(work.commuteBeforeMin / 15)} min={0} max={12} format={(v) => `${v * 15}`} onChange={(v) => set({ commuteBeforeMin: v * 15 })} />
          </div>
          <div className="flex items-center justify-between gap-3 min-h-[52px]">
            <div>
              <div className="text-[15px]">Deslocamento depois</div>
              <div className="text-[12.5px] text-muted">minutos de volta</div>
            </div>
            <Stepper label="deslocamento depois" value={Math.round(work.commuteAfterMin / 15)} min={0} max={12} format={(v) => `${v * 15}`} onChange={(v) => set({ commuteAfterMin: v * 15 })} />
          </div>
        </div>
      </Card>

      <div className="text-[13px] font-medium text-ink-2 mt-5 mb-2 px-1">Checklist da noite anterior 👜</div>
      <ListCard>
        {work.presencialChecklist.map((item, i) => (
          <div key={`${item}-${i}`} className="flex items-center gap-2 min-h-[52px] pl-4 pr-2">
            <span className="flex-1 min-w-0 text-[15px] truncate">{item}</span>
            <IconButton
              label={`Tirar ${item}`}
              size="sm"
              onClick={() => {
                const removed = work.presencialChecklist
                set({ presencialChecklist: removed.filter((_, j) => j !== i) })
                toast('Tirei da lista', { action: { label: 'Desfazer', run: () => actions.setProfile({ work: { ...work, presencialChecklist: removed } }) } })
              }}
            >
              <X size={16} />
            </IconButton>
          </div>
        ))}
        <form
          className="flex items-center gap-2 min-h-[56px] pl-4 pr-2"
          onSubmit={(e) => {
            e.preventDefault()
            addItem()
          }}
        >
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Adicionar item…"
            aria-label="Novo item do checklist"
            enterKeyHint="done"
            className="flex-1 min-w-0 bg-transparent outline-none text-[16px] placeholder:text-muted/70 h-11"
          />
          <IconButton label="Adicionar item" size="sm" variant="soft" type="submit" disabled={!newItem.trim()} className="disabled:opacity-35">
            <Plus size={16} />
          </IconButton>
        </form>
      </ListCard>
      <Hint>Aparece na noite antes de um dia presencial (“Amanhã é presencial 👜”). Tudo opcional.</Hint>
    </>
  )
}
