import { useState } from 'react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { removeWithUndo } from '@/app/undo'
import { actions, getDB, nextOrder } from '@/data/store'
import type { Priority, Project, ProjectStatus, Tone } from '@/data/types'
import { ChipSelect, DateInput, Field, MoreOptions, SheetLayout, TextArea, TextInput, TitleInput, tone } from '@/components/ui'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { PRIORITY_OPTIONS, PROJECT_STATUS_OPTIONS, TONE_OPTIONS } from './constants'
import { updateProject } from './mutations'

const EMOJIS = ['💼', '🏦', '👗', '🌅', '🧘‍♀️', '🎬', '🚀', '🤖', '📱', '🧠', '🌱', '✍️']

export default function ProjectSheet({ id }: SheetProps<'project'>) {
  const existing = id ? getDB().projects.find((p) => p.id === id) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '💼')
  const [role, setRole] = useState(existing?.role ?? '')
  const [status, setStatus] = useState<ProjectStatus>(existing?.status ?? 'ativo')
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'media')
  const [projectTone, setTone] = useState<Tone>(existing?.tone ?? 'ocean')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [objective, setObjective] = useState(existing?.objective ?? '')
  const [deadline, setDeadline] = useState(existing?.deadline)
  const [creator, setCreator] = useState(existing?.kind === 'creator')

  const save = () => {
    const data: Partial<Project> = {
      name: name.trim(),
      emoji: emoji.trim() || '💼',
      role: role.trim() || undefined,
      status,
      priority,
      tone: projectTone,
      description: description.trim() || undefined,
      objective: objective.trim() || undefined,
      deadline,
      kind: creator ? 'creator' : 'default',
    }
    if (existing) {
      updateProject(existing.id, data)
      toast('Projeto atualizado')
    } else {
      const db = getDB()
      actions.create('projects', {
        ...(data as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>),
        nextAction: undefined,
        links: [],
        files: [],
        people: [],
        decisions: [],
        changelog: [],
        order: nextOrder(db.projects),
      })
      haptic('light')
      toast('Nova frente criada 🌱')
    }
    closeSheet()
  }

  return (
    <SheetLayout
      eyebrow={existing ? 'Editar projeto' : 'Novo projeto'}
      onClose={closeSheet}
      primary={{ label: existing ? 'Salvar' : 'Criar projeto', onClick: save, disabled: !name.trim() }}
      onDelete={
        existing
          ? () => {
              closeSheet()
              removeWithUndo('projects', existing.id, 'Projeto apagado')
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        <input
          aria-label="Emoji"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          className={cn('h-14 w-14 rounded-[18px] text-center text-[28px] outline-none shrink-0', tone(projectTone).soft)}
        />
        <TitleInput autoFocus={!existing} placeholder="Nome do projeto" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEmoji(e)}
            className={cn('h-10 w-10 rounded-xl text-[20px] shrink-0', emoji === e ? 'bg-surface-2 ring-1 ring-line' : '')}
            aria-label={`Usar ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <Field label="Seu papel">
        <TextInput placeholder="ex.: Produto / IA" value={role} onChange={(e) => setRole(e.target.value)} />
      </Field>
      <Field label="Prioridade">
        <ChipSelect value={priority} onChange={(v) => v && setPriority(v)} options={PRIORITY_OPTIONS} />
      </Field>
      <MoreOptions defaultOpen={!!existing}>
        <Field label="Status">
          <ChipSelect value={status} onChange={(v) => v && setStatus(v)} options={PROJECT_STATUS_OPTIONS} />
        </Field>
        <Field label="Descrição">
          <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Em uma frase, o que é" />
        </Field>
        <Field label="Objetivo">
          <TextArea rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="O que seria sucesso aqui?" />
        </Field>
        <Field label="Deadline" hint="Só se existir de verdade.">
          <DateInput value={deadline} onChange={setDeadline} />
        </Field>
        <Field label="Cor">
          <div className="flex gap-2">
            {TONE_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                aria-label={`Cor ${t}`}
                aria-pressed={projectTone === t}
                onClick={() => setTone(t)}
                className={cn('h-10 w-10 rounded-full', tone(t).soft, projectTone === t && 'ring-2 ring-offset-2 ring-offset-surface ring-ink/40')}
              >
                <span className={cn('block h-3 w-3 rounded-full mx-auto', tone(t).dot)} />
              </button>
            ))}
          </div>
        </Field>
        <label className="flex items-center justify-between gap-3 min-h-11">
          <span className="text-[14px] text-ink-2">Frente de conteúdo (Creator / UGC)</span>
          <input type="checkbox" checked={creator} onChange={(e) => setCreator(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
        </label>
      </MoreOptions>
    </SheetLayout>
  )
}
