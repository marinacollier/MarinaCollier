import { useState } from 'react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { removeWithUndo } from '@/app/undo'
import { actions, getDB } from '@/data/store'
import type { WorkInboxItem, WorkInboxKind } from '@/data/types'
import { ChipSelect, DateInput, Field, MoreOptions, Select, SheetLayout, TextArea, TextInput, TitleInput } from '@/components/ui'
import { nowISO } from '@/lib/id'
import { INBOX_KINDS, INBOX_SOURCE_OPTIONS, PRIVACY_NOTE } from './constants'

/** Manual Work Inbox item: something that *might* need action. Deciding happens in the inbox. */
export default function WorkInboxItemSheet({ id }: SheetProps<'workInboxItem'>) {
  const existing = id ? getDB().workInbox.find((i) => i.id === id) : undefined
  const projects = getDB().projects
  const [subject, setSubject] = useState(existing?.subject ?? '')
  const [kind, setKind] = useState<WorkInboxKind>(existing?.kind ?? 'responder')
  const [sender, setSender] = useState(existing?.sender ?? '')
  const [source, setSource] = useState<WorkInboxItem['source']>(existing?.source ?? 'manual')
  const [projectId, setProjectId] = useState(existing?.projectId)
  const [dueDate, setDueDate] = useState(existing?.dueDate)
  const [summary, setSummary] = useState(existing?.summary ?? '')
  const [link, setLink] = useState(existing?.link ?? '')

  const save = () => {
    const data = {
      subject: subject.trim(),
      kind,
      sender: sender.trim() || undefined,
      source,
      projectId,
      dueDate,
      summary: summary.trim() || undefined,
      link: link.trim() || undefined,
    }
    if (existing) {
      actions.update('workInbox', existing.id, data)
      toast('Item atualizado')
    } else {
      actions.create('workInbox', { ...data, status: 'novo', receivedAt: nowISO() })
      toast('Foi pro Work Inbox — decide quando der')
    }
    closeSheet()
  }

  return (
    <SheetLayout
      eyebrow={existing ? 'Editar item' : 'Work Inbox'}
      onClose={closeSheet}
      primary={{ label: existing ? 'Salvar' : 'Adicionar', onClick: save, disabled: !subject.trim() }}
      onDelete={
        existing
          ? () => {
              closeSheet()
              removeWithUndo('workInbox', existing.id, 'Item apagado')
            }
          : undefined
      }
    >
      <TitleInput autoFocus={!existing} placeholder="Assunto" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <Field label="O que isso pede?">
        <ChipSelect value={kind} onChange={(v) => v && setKind(v)} options={INBOX_KINDS} />
      </Field>
      <Field label="De quem">
        <TextInput placeholder="Remetente (opcional)" value={sender} onChange={(e) => setSender(e.target.value)} />
      </Field>
      <MoreOptions>
        <Field label="Origem">
          <ChipSelect value={source} onChange={(v) => v && setSource(v)} options={INBOX_SOURCE_OPTIONS} />
        </Field>
        <Field label="Projeto">
          <Select value={projectId} onChange={setProjectId} placeholder="Sem projeto" options={projects.map((p) => ({ value: p.id, label: `${p.emoji} ${p.name}` }))} />
        </Field>
        <Field label="Deadline">
          <DateInput value={dueDate} onChange={setDueDate} />
        </Field>
        <Field label="Resumo curto" hint={PRIVACY_NOTE}>
          <TextArea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Uma linha, com suas palavras" />
        </Field>
        <Field label="Link">
          <TextInput inputMode="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
