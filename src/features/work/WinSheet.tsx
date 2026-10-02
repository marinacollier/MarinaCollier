import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { removeWithUndo } from '@/app/undo'
import { actions, getDB } from '@/data/store'
import type { WinKind } from '@/data/types'
import { ChipSelect, DateInput, Field, MoreOptions, Select, SheetLayout, TextArea, TextInput, TitleInput } from '@/components/ui'
import { haptic } from '@/lib/haptics'
import { todayKey } from '@/lib/date'
import { WIN_KINDS } from './constants'

const WIN_MESSAGES = ['Que orgulho! ✨', 'Guardado com carinho ✨', 'Isso merece ser lembrado ✨']

export default function WinSheet({ id, projectId }: SheetProps<'win'>) {
  const existing = id ? getDB().wins.find((w) => w.id === id) : undefined
  const projects = getDB().projects
  const [title, setTitle] = useState(existing?.title ?? '')
  const [kind, setKind] = useState<WinKind>(existing?.kind ?? 'entrega')
  const [date, setDate] = useState(existing?.date ?? todayKey())
  const [project, setProject] = useState(existing?.projectId ?? projectId)
  const [description, setDescription] = useState(existing?.description ?? '')
  const [impact, setImpact] = useState(existing?.impact ?? '')
  const [link, setLink] = useState(existing?.link ?? '')
  const [celebrating, setCelebrating] = useState(false)

  const save = () => {
    if (celebrating) return
    const data = {
      title: title.trim(),
      kind,
      date: date ?? todayKey(),
      projectId: project,
      description: description.trim() || undefined,
      impact: impact.trim() || undefined,
      link: link.trim() || undefined,
    }
    if (existing) {
      actions.update('wins', existing.id, data)
      toast('Win atualizado ✨', { tone: 'win' })
      closeSheet()
      return
    }
    actions.create('wins', data)
    haptic('success')
    setCelebrating(true)
    toast(WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)], { tone: 'win' })
    setTimeout(closeSheet, 750)
  }

  return (
    <SheetLayout
      eyebrow={existing ? 'Editar win' : 'Novo win'}
      onClose={closeSheet}
      primary={{ label: existing ? 'Salvar' : 'Guardar win ✨', onClick: save, disabled: !title.trim() }}
      onDelete={
        existing
          ? () => {
              closeSheet()
              removeWithUndo('wins', existing.id, 'Win apagado')
            }
          : undefined
      }
    >
      <div className="relative">
        <motion.div
          animate={celebrating ? { scale: [1, 1.04, 1], opacity: [1, 1, 0.6] } : { scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <TitleInput autoFocus={!existing} placeholder="O que você conquistou?" value={title} onChange={(e) => setTitle(e.target.value)} />
        </motion.div>
        <AnimatePresence>{celebrating && <Sparkle />}</AnimatePresence>
      </div>
      <Field label="Tipo">
        <ChipSelect
          value={kind}
          onChange={(v) => v && setKind(v)}
          options={WIN_KINDS.map((k) => ({ value: k.value, label: `${k.emoji} ${k.label}` }))}
        />
      </Field>
      <Field label="Projeto">
        <Select
          value={project}
          onChange={setProject}
          placeholder="Sem projeto"
          options={projects.map((p) => ({ value: p.id, label: `${p.emoji} ${p.name}` }))}
        />
      </Field>
      <MoreOptions defaultOpen={!!existing}>
        <Field label="Quando">
          <DateInput value={date} onChange={(v) => setDate(v ?? todayKey())} />
        </Field>
        <Field label="Impacto" hint="Números ou efeito concreto — ótimo para o currículo.">
          <TextArea rows={2} value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="ex.: reduziu o tempo de aprovação pela metade" />
        </Field>
        <Field label="Detalhes">
          <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Link">
          <TextInput inputMode="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}

/** Soft sparkle burst — a few glyphs that drift up and fade. Not confetti. */
function Sparkle() {
  const bits = [
    { x: -70, y: -26, d: 0 },
    { x: 40, y: -34, d: 0.05 },
    { x: 110, y: -14, d: 0.1 },
    { x: -10, y: -40, d: 0.12 },
  ]
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute text-[18px] text-sand"
          initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0.4, 1.1, 0.9], x: b.x, y: b.y }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: b.d, ease: 'easeOut' }}
        >
          ✦
        </motion.span>
      ))}
    </div>
  )
}
