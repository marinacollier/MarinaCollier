import { useMemo, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { closeSheet, openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { BrandPartnership, NewItem } from '@/data/types'
import { Button, ChipSelect, DateInput, Field, MoneyInput, MoreOptions, SheetLayout, TextArea, TextInput, TitleInput } from '@/components/ui'
import { haptic } from '@/lib/haptics'
import { contentStageMeta, FORMATS, PARTNERSHIP_STAGES } from './constants'
import { Group, LinksEditor } from './components'
import { contentForPartnership } from './selectors'

type Draft = NewItem<'partnerships'>

function blank(): Draft {
  return { brand: '', stage: 'contato', links: [], order: nextOrder(getDB().partnerships) }
}

const STAGE_OPTIONS = PARTNERSHIP_STAGES.map((s) => ({ value: s.value, label: `${s.emoji} ${s.label}` }))

export default function PartnershipSheet({ id }: SheetProps<'partnership'>) {
  const existing = useDB((db) => (id ? db.partnerships.find((p) => p.id === id) : undefined))
  const [draft, setDraft] = useState<Draft>(() => (existing ? { ...existing } : blank()))
  const set = (patch: Partial<BrandPartnership>) => setDraft((d) => ({ ...d, ...patch }))

  const contentItems = useDB((db) => db.contentItems)
  const linked = useMemo(() => (id ? contentForPartnership(contentItems, id) : []), [contentItems, id])

  const hasDetails = !!(
    existing &&
    (existing.contact ||
      existing.format ||
      existing.briefing ||
      existing.deliverables ||
      existing.deadline ||
      existing.valueCents ||
      existing.barter ||
      existing.coupon ||
      existing.affiliateLink ||
      existing.links.length ||
      existing.notes ||
      linked.length)
  )

  const canSave = draft.brand.trim().length > 0

  const save = () => {
    if (!canSave) return
    const clean: Draft = { ...draft, brand: draft.brand.trim() }
    for (const k of ['contact', 'format', 'briefing', 'deliverables', 'barter', 'coupon', 'affiliateLink', 'notes'] as const) {
      const v = clean[k]
      if (typeof v === 'string' && !v.trim()) clean[k] = undefined
    }
    if (id && existing) {
      actions.update('partnerships', id, clean)
      toast('Parceria atualizada')
    } else {
      actions.create('partnerships', clean)
      haptic('light')
      toast(`${clean.brand} no pipeline ✨`)
    }
    closeSheet()
  }

  const remove = () => {
    if (!id) return
    closeSheet()
    removeWithUndo('partnerships', id, 'Parceria apagada')
  }

  const newContent = () => {
    if (!id) return
    const item = actions.create('contentItems', {
      title: `Conteúdo ${draft.brand.trim() || existing?.brand || ''}`.trim(),
      stage: 'gravar',
      partnershipId: id,
      format: FORMATS.find((f) => f === draft.format),
      deadline: draft.deadline,
      links: [],
      order: nextOrder(getDB().contentItems),
    })
    openSheet('content', { id: item.id })
  }

  return (
    <SheetLayout
      eyebrow={existing ? 'Parceria' : 'Nova parceria'}
      title={existing ? existing.brand : 'Qual marca?'}
      onClose={closeSheet}
      onDelete={existing ? remove : undefined}
      primary={{ label: existing ? 'Salvar' : 'Adicionar', onClick: save, disabled: !canSave }}
    >
      <TitleInput
        autoFocus={!existing}
        placeholder="Nome da marca"
        value={draft.brand}
        onChange={(e) => set({ brand: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        aria-label="Marca"
      />
      <Group label="Etapa">
        <ChipSelect value={draft.stage} onChange={(v) => v && set({ stage: v })} options={STAGE_OPTIONS} />
      </Group>

      <MoreOptions defaultOpen={hasDetails}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prazo">
            <DateInput value={draft.deadline} onChange={(v) => set({ deadline: v })} />
          </Field>
          <Field label="Valor">
            <MoneyInput valueCents={draft.valueCents} onChange={(v) => set({ valueCents: v })} />
          </Field>
        </div>
        <Field label="Permuta" hint="pode ser junto com o valor, ou só ela">
          <TextInput placeholder="ex.: kit de produtos, diária…" value={draft.barter ?? ''} onChange={(e) => set({ barter: e.target.value })} />
        </Field>
        <Field label="Formato">
          <TextInput placeholder="ex.: 1 Reels + 3 Stories" value={draft.format ?? ''} onChange={(e) => set({ format: e.target.value })} />
        </Field>
        <Field label="Contato">
          <TextInput placeholder="nome, e-mail ou @" value={draft.contact ?? ''} onChange={(e) => set({ contact: e.target.value })} />
        </Field>
        <Field label="Briefing">
          <TextArea placeholder="o que a marca quer contar" value={draft.briefing ?? ''} onChange={(e) => set({ briefing: e.target.value })} />
        </Field>
        <Field label="Entregas">
          <TextArea rows={2} placeholder="o que precisa ser entregue" value={draft.deliverables ?? ''} onChange={(e) => set({ deliverables: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cupom">
            <TextInput placeholder="MARINA10" autoCapitalize="characters" value={draft.coupon ?? ''} onChange={(e) => set({ coupon: e.target.value })} />
          </Field>
          <Field label="Link de afiliado">
            <TextInput type="url" inputMode="url" placeholder="https://" value={draft.affiliateLink ?? ''} onChange={(e) => set({ affiliateLink: e.target.value })} />
          </Field>
        </div>
        <Group label="Links">
          <LinksEditor value={draft.links} onChange={(links) => set({ links })} />
        </Group>

        {existing && (
          <div>
            <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Conteúdo produzido</div>
            {linked.length > 0 && (
              <div className="rounded-2xl bg-surface-2 divide-y divide-line/70 overflow-hidden mb-2">
                {linked.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openSheet('content', { id: c.id })}
                    className="w-full flex items-center gap-3 min-h-[48px] px-3.5 py-2 text-left active:bg-line/60"
                  >
                    <span aria-hidden>{contentStageMeta(c.stage).emoji}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14.5px] truncate">{c.title}</span>
                      <span className="block text-[12px] text-muted">{contentStageMeta(c.stage).label}</span>
                    </span>
                    <ChevronRight size={16} className="text-muted shrink-0" />
                  </button>
                ))}
              </div>
            )}
            <Button variant="soft" size="sm" icon={<Plus size={15} />} onClick={newContent}>
              Criar conteúdo dessa parceria
            </Button>
          </div>
        )}

        <Field label="Notas">
          <TextArea placeholder="combinados, ideias, lembretes" value={draft.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
