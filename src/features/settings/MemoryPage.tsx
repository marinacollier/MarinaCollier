/**
 * "O que Lumos sabe sobre mim" — secondary screen (Ajustes → Lumos Memory). Read, correct, remove,
 * add. Observed patterns can be confirmed as a preference or dismissed; nothing becomes a rule alone.
 */
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { removeWithUndo } from '@/app/undo'
import { toast } from '@/app/ui-store'
import { ROUTES } from '@/app/routes'
import { EmptyState, Field, IconButton, Page, PageHeader, Segmented, Select, SheetFrame, SheetLayout, TextArea } from '@/components/ui'
import { memoryView, type MemoryView } from '@/data/intel'
import { actions, useDB } from '@/data/store'
import type { MemoryArea, MemoryItem, MemoryKind } from '@/data/types'
import { useNow } from '@/hooks/useToday'
import { formatShortDate } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { nowISO } from '@/lib/id'
import { AREA_LABEL, groupMemory, KIND_OPTIONS, PROVENANCE_LABEL, SECTION_META } from './memory'

const AREA_OPTIONS = (Object.keys(AREA_LABEL) as MemoryArea[]).map((value) => ({ value, label: AREA_LABEL[value] }))

type Draft = { id?: string; text: string; kind: MemoryKind; area: MemoryArea }

function MemorySheet({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const [d, setD] = useState(draft)
  const save = () => {
    const text = d.text.trim()
    if (!text) return
    if (d.id) {
      actions.update('memory', d.id, { text, kind: d.kind, area: d.area, status: 'confirmed', source: 'marina', lastSeenAt: nowISO() })
      toast('Corrigido ✓ — Lumos já usa assim')
    } else {
      actions.create('memory', { text, kind: d.kind, area: d.area, status: 'confirmed', source: 'marina', lastSeenAt: nowISO() })
      toast('Guardado ✓')
    }
    haptic('success')
    onClose()
  }
  return (
    <SheetLayout
      title={d.id ? 'Corrigir' : 'Contar pra Lumos'}
      onClose={onClose}
      onDelete={
        d.id
          ? () => {
              removeWithUndo('memory', d.id!, 'Lumos esqueceu isso')
              onClose()
            }
          : undefined
      }
      primary={{ label: 'Salvar', onClick: save, disabled: !d.text.trim() }}
    >
      <TextArea autoFocus={!d.id} rows={3} value={d.text} placeholder="ex.: não faço mais yoga na terça" onChange={(e) => setD({ ...d, text: e.target.value })} />
      <Segmented value={d.kind} onChange={(kind) => setD({ ...d, kind })} options={KIND_OPTIONS} />
      <Field label="Área">
        <Select value={d.area} onChange={(area) => area && setD({ ...d, area })} options={AREA_OPTIONS} />
      </Field>
    </SheetLayout>
  )
}

function Row({ v, onEdit }: { v: MemoryView; onEdit: (item: MemoryItem) => void }) {
  const item = v.item
  const meta = [item ? AREA_LABEL[item.area] : undefined, PROVENANCE_LABEL[v.provenance], v.validUntil ? `até ${formatShortDate(v.validUntil)}` : undefined].filter(Boolean).join(' · ')
  const observed = v.layer === 'pattern' && item
  return (
    <li className="py-3 border-t border-line/60 first:border-t-0">
      <button type="button" disabled={!item} onClick={() => item && onEdit(item)} className="w-full text-left enabled:active:opacity-70">
        <span className="block text-[15.5px] leading-snug">{v.text}</span>
        <span className="block text-[12.5px] text-muted mt-1">
          {meta}
          {observed && item.evidence ? ` · visto ${item.evidence}x` : ''}
        </span>
      </button>
      {observed && (
        <div className="flex gap-1.5 mt-2">
          <button
            type="button"
            onClick={() => {
              actions.update('memory', item.id, { status: 'confirmed', kind: 'preference', source: 'marina', askedAt: item.askedAt ?? nowISO() })
              haptic('success')
              toast('Agora é preferência ✓')
            }}
            className="min-h-9 px-3 rounded-full bg-accent-soft text-accent text-[13px] font-medium active:scale-[0.97] transition"
          >
            é isso mesmo
          </button>
          <button
            type="button"
            onClick={() => {
              actions.update('memory', item.id, { status: 'archived', askedAt: item.askedAt ?? nowISO() })
              toast('Ok, não considero ✓')
            }}
            className="min-h-9 px-3 rounded-full bg-surface-2 text-[13px] text-ink-2 active:scale-[0.97] transition"
          >
            não é bem assim
          </button>
        </div>
      )}
    </li>
  )
}

export default function MemoryPage() {
  const db = useDB()
  const { today, minutes } = useNow()
  const groups = useMemo(() => groupMemory(memoryView(db, { date: today, minutes })), [db, today, minutes])
  const [draft, setDraft] = useState<Draft>()

  return (
    <Page>
      <PageHeader
        title="O que Lumos sabe sobre mim"
        back
        backTo={ROUTES.settings}
        search={false}
        subtitle="Tudo editável. Se algo estiver errado, corrige aqui ou conta pra ela."
        actions={
          <IconButton label="Contar algo pra Lumos" onClick={() => setDraft({ text: '', kind: 'fact', area: 'rotina' })}>
            <Plus size={21} />
          </IconButton>
        }
      />

      {groups.length === 0 ? (
        <EmptyState emoji="✦" title="Ainda pouca coisa por aqui." text="Conforme você conversa com a Lumos, ela guarda o que importa — e você vê tudo aqui." />
      ) : (
        groups.map((g, i) => (
          <motion.section key={g.section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="mt-6">
            <div className="px-1 mb-1.5">
              <h2 className="eyebrow">{SECTION_META[g.section].title}</h2>
              <p className="text-[12.5px] text-muted mt-0.5">{SECTION_META[g.section].hint}</p>
            </div>
            <ul className="card px-4 py-0.5">
              {g.items.map((v, k) => (
                <Row key={v.item?.id ?? `${g.section}-${k}`} v={v} onEdit={(item) => setDraft({ id: item.id, text: item.text, kind: item.kind, area: item.area })} />
              ))}
            </ul>
          </motion.section>
        ))
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {draft && (
              <SheetFrame key={draft.id ?? "new"} onClose={() => setDraft(undefined)} depth={4}>
                <MemorySheet draft={draft} onClose={() => setDraft(undefined)} />
              </SheetFrame>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </Page>
  )
}
