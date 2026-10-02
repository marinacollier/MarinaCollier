import { useState } from 'react'
import { Pin, PinOff, X } from 'lucide-react'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { Chip, Field, MoreOptions, Segmented, Select, SheetLayout, TitleInput } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { Note } from '@/data/types'
import { haptic } from '@/lib/haptics'

type Kind = Note['kind']

export default function NoteSheet({ id, kind }: SheetProps<'note'>) {
  const existing = useDB((db) => (id ? db.notes.find((n) => n.id === id) : undefined))
  const projects = useDB((db) => db.projects)
  const trips = useDB((db) => db.trips)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [k, setK] = useState<Kind>(existing?.kind ?? kind ?? 'nota')
  const [tags, setTags] = useState<string[]>(existing?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [pinned, setPinned] = useState(existing?.pinned ?? false)
  const [projectId, setProjectId] = useState(existing?.projectId)
  const [tripId, setTripId] = useState(existing?.tripId)

  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, '').toLowerCase()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagDraft('')
  }

  const canSave = !!(title.trim() || body.trim())

  const save = () => {
    if (!canSave) return
    const pendingTag = tagDraft.trim().replace(/^#/, '').toLowerCase()
    const finalTags = pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags
    const data = { title: title.trim() || undefined, body: body.trim(), kind: k, tags: finalTags, pinned, projectId, tripId }
    if (existing) {
      actions.update('notes', existing.id, data)
      toast('Salvo ✓')
    } else {
      actions.create('notes', data)
      haptic('light')
      toast(k === 'ideia' ? 'Ideia guardada 💡' : 'Nota guardada ✓')
    }
    closeSheet()
  }

  return (
    <SheetLayout
      eyebrow={k === 'ideia' ? 'Ideia' : 'Nota'}
      title={existing ? 'Editar' : k === 'ideia' ? 'Nova ideia 💡' : 'Nova nota'}
      onClose={closeSheet}
      onDelete={
        existing
          ? () => {
              removeWithUndo('notes', existing.id, k === 'ideia' ? 'Ideia apagada' : 'Nota apagada')
              closeSheet()
            }
          : undefined
      }
      primary={{ label: 'Salvar', onClick: save, disabled: !canSave }}
    >
      <div className="flex items-center gap-2">
        <Segmented
          className="flex-1"
          value={k}
          onChange={setK}
          options={[
            { value: 'nota', label: '📝 Nota' },
            { value: 'ideia', label: '💡 Ideia' },
          ]}
        />
        <button
          type="button"
          onClick={() => setPinned((p) => !p)}
          aria-pressed={pinned}
          aria-label={pinned ? 'Desafixar' : 'Fixar'}
          className={`h-11 w-11 rounded-full inline-flex items-center justify-center transition ${pinned ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}
        >
          {pinned ? <Pin size={18} /> : <PinOff size={18} />}
        </button>
      </div>
      <TitleInput placeholder="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        autoFocus={!existing}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={k === 'ideia' ? 'Qual é a ideia? Escreve solto.' : 'Escreve aqui…'}
        rows={7}
        className="w-full bg-surface-2 rounded-2xl p-4 outline-none resize-none leading-relaxed text-[16px] placeholder:text-muted/80 border border-transparent focus:border-accent/40 min-h-[160px]"
      />
      <Field label="Tags">
        <div className="flex flex-wrap gap-2 items-center">
          {tags.map((t) => (
            <Chip key={t} selected onClick={() => setTags(tags.filter((x) => x !== t))}>
              #{t} <X size={12} />
            </Chip>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addTag()
              }
            }}
            onBlur={addTag}
            placeholder="+ tag"
            className="h-9 px-3 rounded-full bg-surface-2 outline-none min-w-[90px] flex-1 text-[16px]"
          />
        </div>
      </Field>
      {(projects.length > 0 || trips.length > 0) && (
        <MoreOptions label="ligar a um projeto ou viagem" defaultOpen={!!(projectId || tripId)}>
          {projects.length > 0 && (
            <Field label="Projeto">
              <Select value={projectId} onChange={setProjectId} placeholder="Nenhum" options={projects.map((p) => ({ value: p.id, label: `${p.emoji} ${p.name}` }))} />
            </Field>
          )}
          {trips.length > 0 && (
            <Field label="Viagem">
              <Select value={tripId} onChange={setTripId} placeholder="Nenhuma" options={trips.map((t) => ({ value: t.id, label: `${t.flag} ${t.name}` }))} />
            </Field>
          )}
        </MoreOptions>
      )}
    </SheetLayout>
  )
}
