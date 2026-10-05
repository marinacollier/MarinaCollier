import { useMemo, useState } from 'react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { removeWithUndo } from '@/app/undo'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { StudyItem, StudyStatus } from '@/data/types'
import { ChipSelect, Field, MoreOptions, SheetLayout, TextArea, TextInput, TitleInput } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { haptic } from '@/lib/haptics'
import { WhatsNext } from './components/WhatsNext'
import { ProgressSlider } from './components/ProgressSlider'
import { STUDY_KIND_LABEL, STUDY_STATUS_LABEL, activeTracks, clampProgress, finishStudyPatch, isReference, parseCapture, topOrder } from './selectors'

type Form = Pick<StudyItem, 'title' | 'kind' | 'status' | 'progress'> & Partial<Pick<StudyItem, 'trackId' | 'source' | 'link' | 'nextContent' | 'notes' | 'reference'>>

const KINDS = Object.keys(STUDY_KIND_LABEL) as StudyItem['kind'][]
const STATUSES: StudyStatus[] = ['estudando', 'proximo', 'backlog', 'pausado', 'finalizado']

export default function StudySheet({ id, defaults }: SheetProps<'study'>) {
  const today = useToday()
  const existing = useDB((db) => (id ? db.studyItems.find((s) => s.id === id) : undefined))
  const allTracks = useDB((db) => db.studyTracks)
  const tracks = useMemo(() => {
    const act = activeTracks(allTracks)
    // keep the item's own (archived) trilha selectable while editing
    const own = existing?.trackId ? allTracks.find((t) => t.id === existing.trackId && t.archived) : undefined
    return own ? [...act, own] : act
  }, [allTracks, existing?.trackId])

  const [form, setForm] = useState<Form>(() => ({
    title: existing?.title ?? defaults?.title ?? '',
    kind: existing?.kind ?? defaults?.kind ?? 'curso',
    status: existing?.status ?? defaults?.status ?? 'backlog',
    progress: existing?.progress ?? defaults?.progress ?? 0,
    trackId: existing?.trackId ?? defaults?.trackId,
    source: existing?.source ?? defaults?.source,
    link: existing?.link ?? defaults?.link,
    nextContent: existing?.nextContent ?? defaults?.nextContent,
    notes: existing?.notes ?? defaults?.notes,
    reference: existing ? isReference(existing) : defaults?.reference,
  }))
  const [finished, setFinished] = useState<Pick<StudyItem, 'id' | 'title' | 'trackId'> | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  if (finished) return <WhatsNext finished={finished} onDone={closeSheet} />

  const save = () => {
    let title = form.title.trim()
    let link = form.link?.trim() || undefined
    if (!title) return
    // a pasted URL as title becomes the link + hostname title
    if (!link) {
      const parsed = parseCapture(title)
      if (parsed.link) {
        title = parsed.title
        link = parsed.link
      }
    }
    const items = getDB().studyItems
    const wasFinished = existing?.status === 'finalizado'
    const nowFinished = !form.reference && form.status === 'finalizado'
    const patch: Partial<StudyItem> = {
      ...form,
      title,
      link,
      source: form.source?.trim() || undefined,
      nextContent: form.nextContent?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
      progress: clampProgress(form.progress),
      reference: form.reference || undefined,
    }
    if (nowFinished && !wasFinished) Object.assign(patch, finishStudyPatch(today))
    if (!nowFinished) patch.finishedAt = undefined
    if (existing && existing.status !== form.status) {
      const peers = items.filter((i) => i.status === form.status && i.id !== existing.id)
      patch.order = form.status === 'backlog' ? topOrder(peers) : nextOrder(peers)
    }

    let saved: StudyItem
    if (existing) {
      actions.update('studyItems', existing.id, patch)
      saved = { ...existing, ...patch }
    } else {
      const peers = items.filter((i) => i.status === form.status)
      saved = actions.create('studyItems', {
        ...(patch as Form),
        order: form.status === 'backlog' ? topOrder(peers) : nextOrder(peers),
      })
    }

    if (nowFinished && !wasFinished) {
      haptic('success')
      toast('Terminou! que orgulho 🎉', { tone: 'win' })
      setFinished(saved)
      return
    }
    toast(existing ? 'Atualizado' : form.reference ? 'Guardado nos conteúdos salvos 💡' : form.status === 'backlog' ? 'Guardado no backlog 📥' : 'Anotado 📚')
    closeSheet()
  }

  return (
    <SheetLayout
      title={existing ? 'Editar estudo' : 'Novo estudo'}
      onClose={closeSheet}
      onDelete={
        existing
          ? () => {
              removeWithUndo('studyItems', existing.id, 'Estudo apagado')
              closeSheet()
            }
          : undefined
      }
      primary={{ label: existing ? 'Salvar' : 'Adicionar', onClick: save, disabled: !form.title.trim() }}
    >
      <TitleInput
        autoFocus={!existing}
        placeholder="O que você quer estudar?"
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      {tracks.length > 0 && (
        <Field label="Trilha">
          <ChipSelect
            clearable
            wrap={false}
            value={form.trackId}
            onChange={(v) => set('trackId', v)}
            options={tracks.map((t) => ({ value: t.id, label: `${t.emoji} ${t.name}` }))}
          />
        </Field>
      )}
      <Field label="Tipo">
        <ChipSelect value={form.kind} onChange={(v) => v && set('kind', v)} options={KINDS.map((k) => ({ value: k, label: STUDY_KIND_LABEL[k] }))} />
      </Field>
      <Field label="Guardar como" hint={form.reference ? 'fica em “Conteúdos salvos”: sem fila, sem prazo.' : undefined}>
        <ChipSelect
          value={form.reference ? 'ref' : 'estudo'}
          onChange={(v) => v && set('reference', v === 'ref')}
          options={[
            { value: 'estudo', label: 'pra estudar' },
            { value: 'ref', label: 'referência' },
          ]}
        />
      </Field>
      {!form.reference && (
        <Field label="Status">
          <ChipSelect value={form.status} onChange={(v) => v && set('status', v)} options={STATUSES.map((s) => ({ value: s, label: STUDY_STATUS_LABEL[s] }))} />
        </Field>
      )}
      <MoreOptions defaultOpen={!!existing && (form.status === 'estudando' || !!form.nextContent)}>
        <Field label="Próximo conteúdo" hint="o próximo passo, pra retomar sem pensar">
          <TextInput value={form.nextContent ?? ''} placeholder="ex.: módulo 3, aula de quinta…" onChange={(e) => set('nextContent', e.target.value)} />
        </Field>
        {!form.reference && (
          <Field label={`Progresso · ${clampProgress(form.progress)}%`}>
            <ProgressSlider value={form.progress} onChange={(v) => set('progress', v)} />
          </Field>
        )}
        <Field label="Fonte">
          <TextInput value={form.source ?? ''} placeholder="Alura, Coursera, professora…" onChange={(e) => set('source', e.target.value)} />
        </Field>
        <Field label="Link">
          <TextInput type="url" inputMode="url" value={form.link ?? ''} placeholder="https://" onChange={(e) => set('link', e.target.value)} />
        </Field>
        <Field label="Notas">
          <TextArea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
