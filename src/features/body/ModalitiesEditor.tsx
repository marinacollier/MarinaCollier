import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Eye, EyeOff, Plus, Star } from 'lucide-react'
import { actions, useDB } from '@/data/store'
import type { Modality } from '@/data/types'
import { TONES, tone } from '@/components/ui'
import { cn } from '@/lib/cn'
import { uniqueModalityId } from './selectors'
import { GROUP_LABEL, GROUP_ORDER, modalityGroup } from '@/data/planning'
import { GROUP_EMOJI } from './planner'

/** Add / rename / emoji / favorite / active for profile.modalities. Collapsed by default. */
export default function ModalitiesEditor() {
  const modalities = useDB((db) => db.profile.modalities)
  const profile = useDB((db) => db.profile)
  const [open, setOpen] = useState(false)
  const patch = (id: string, p: Partial<Modality>) => actions.setProfile({ modalities: modalities.map((m) => (m.id === id ? { ...m, ...p } : m)) })
  const add = () => {
    const label = 'Nova modalidade'
    actions.setProfile({
      modalities: [...modalities, { id: uniqueModalityId(label, modalities), label, emoji: '✨', tone: 'accent', favorite: true, active: true, hasDistance: false, group: 'fun' }],
    })
  }

  return (
    <div className="card overflow-hidden">
      <button type="button" className="w-full flex items-center gap-3 px-4 min-h-[60px] text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="text-[20px]" aria-hidden>
          🏅
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px]">Modalidades</span>
          <span className="block text-[12.5px] text-muted truncate">
            {modalities
              .filter((m) => m.favorite && m.active)
              .map((m) => m.emoji)
              .join(' ')}
          </span>
        </span>
        <ChevronDown size={18} className={cn('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="px-3 pb-3 space-y-2">
              <p className="text-[12.5px] text-muted px-1 pb-1">⭐ favoritas aparecem primeiro · 👁 desligadas somem das listas</p>
              {modalities.map((m) => (
                <div key={m.id} className={cn('rounded-2xl bg-surface-2 p-2', !m.active && 'opacity-60')}>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Emoji"
                      defaultValue={m.emoji}
                      maxLength={8}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== m.emoji && patch(m.id, { emoji: e.target.value.trim() })}
                      className={cn('h-11 w-11 rounded-xl text-center text-[20px] outline-none shrink-0', tone(m.tone).soft)}
                    />
                    <input
                      aria-label="Nome"
                      defaultValue={m.label}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== m.label && patch(m.id, { label: e.target.value.trim() })}
                      className="flex-1 min-w-0 h-11 rounded-xl bg-surface px-3 outline-none text-[15px]"
                    />
                    <button
                      type="button"
                      aria-label={m.favorite ? 'Tirar dos favoritos' : 'Favoritar'}
                      aria-pressed={m.favorite}
                      onClick={() => patch(m.id, { favorite: !m.favorite })}
                      className="h-11 w-10 inline-flex items-center justify-center"
                    >
                      <Star size={18} className={m.favorite ? 'fill-sand text-sand' : 'text-muted'} />
                    </button>
                    <button
                      type="button"
                      aria-label={m.active ? 'Desligar' : 'Ligar'}
                      aria-pressed={m.active}
                      onClick={() => patch(m.id, { active: !m.active })}
                      className="h-11 w-10 inline-flex items-center justify-center text-muted"
                    >
                      {m.active ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 pl-1">
                    {TONES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-label={`Cor ${t}`}
                        aria-pressed={m.tone === t}
                        onClick={() => patch(m.id, { tone: t })}
                        className="h-8 w-8 inline-flex items-center justify-center"
                      >
                        <span className={cn('h-4 w-4 rounded-full', tone(t).dot, m.tone === t && 'ring-2 ring-offset-2 ring-ink/50 ring-offset-surface-2')} />
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-pressed={m.hasDistance}
                      onClick={() => patch(m.id, { hasDistance: !m.hasDistance })}
                      className={cn('ml-auto h-8 px-3 rounded-full text-[12px]', m.hasDistance ? 'bg-ink text-bg' : 'bg-surface text-muted')}
                    >
                      {m.hasDistance ? 'com km' : 'sem km'}
                    </button>
                  </div>
                  <div className="mt-2 pl-1">
                    <div className="text-[11.5px] text-muted mb-1">conta como (no “Meu treino da semana”)</div>
                    <div className="flex flex-wrap gap-1.5">
                      {GROUP_ORDER.map((g) => {
                        const on = (m.group ?? modalityGroup(profile, m.id)) === g
                        return (
                          <button
                            key={g}
                            type="button"
                            aria-pressed={on}
                            onClick={() => patch(m.id, { group: g })}
                            className={cn('h-8 px-2.5 rounded-full text-[12px]', on ? 'bg-ink text-bg' : 'bg-surface text-ink-2')}
                          >
                            {GROUP_EMOJI[g]} {GROUP_LABEL[g].toLowerCase()}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      aria-pressed={!!m.heavyLogistics}
                      onClick={() => patch(m.id, { heavyLogistics: !m.heavyLogistics })}
                      className={cn('mt-2 h-8 px-3 rounded-full text-[12px]', m.heavyLogistics ? 'bg-sand-soft text-ink' : 'bg-surface text-muted')}
                    >
                      {m.heavyLogistics ? '🧳 logística pesada (aviso em dia presencial)' : 'logística leve'}
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={add} className="w-full h-12 rounded-2xl border border-dashed border-line text-[14px] text-ink-2 inline-flex items-center justify-center gap-1.5">
                <Plus size={16} /> nova modalidade
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
