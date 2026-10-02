import { useMemo, useState } from 'react'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { ContentItem, NewItem } from '@/data/types'
import { ChipSelect, DateInput, Field, MoreOptions, Select, SheetLayout, TextArea, TextInput, TitleInput } from '@/components/ui'
import { haptic } from '@/lib/haptics'
import { todayKey } from '@/lib/date'
import { CATEGORIES, CONTENT_STAGES, FORMATS, PLATFORMS, toOptions } from './constants'
import { Group, LinksEditor } from './components'

type Draft = NewItem<'contentItems'>

function blank(): Draft {
  return { title: '', stage: 'ideia', links: [], order: nextOrder(getDB().contentItems) }
}

const STAGE_OPTIONS = CONTENT_STAGES.map((s) => ({ value: s.value, label: `${s.emoji} ${s.label}` }))
const FORMAT_OPTIONS = toOptions(FORMATS)
const PLATFORM_OPTIONS = toOptions(PLATFORMS)
const CATEGORY_OPTIONS = toOptions(CATEGORIES)

export default function ContentSheet({ id }: SheetProps<'content'>) {
  const existing = useDB((db) => (id ? db.contentItems.find((c) => c.id === id) : undefined))
  const [draft, setDraft] = useState<Draft>(() => (existing ? { ...existing } : blank()))
  const set = (patch: Partial<ContentItem>) => setDraft((d) => ({ ...d, ...patch }))

  const partnerships = useDB((db) => db.partnerships)
  const partnershipOptions = useMemo(
    () =>
      partnerships
        .filter((p) => p.stage !== 'finalizado' || p.id === draft.partnershipId)
        .sort((a, b) => a.brand.localeCompare(b.brand, 'pt-BR'))
        .map((p) => ({ value: p.id, label: p.brand })),
    [partnerships, draft.partnershipId],
  )

  const hasDetails = !!(
    existing &&
    (existing.format ||
      existing.platform ||
      existing.hook ||
      existing.script ||
      existing.assets ||
      existing.cta ||
      existing.deadline ||
      existing.partnershipId ||
      existing.links.length)
  )

  const canSave = draft.title.trim().length > 0

  const save = () => {
    if (!canSave) return
    const clean: Draft = { ...draft, title: draft.title.trim() }
    for (const k of ['hook', 'script', 'assets', 'cta'] as const) {
      const v = clean[k]
      if (typeof v === 'string' && !v.trim()) clean[k] = undefined
    }
    if (clean.stage === 'publicado' && !clean.publishedAt) clean.publishedAt = todayKey()
    if (clean.stage !== 'publicado') clean.publishedAt = undefined
    if (id && existing) {
      actions.update('contentItems', id, clean)
      if (existing.stage !== 'publicado' && clean.stage === 'publicado') {
        haptic('success')
        toast('Publicado! Que bom 🎉', { tone: 'win' })
      } else toast('Conteúdo atualizado')
    } else {
      actions.create('contentItems', clean)
      haptic('light')
      toast(clean.stage === 'ideia' ? 'Ideia guardada 💡' : 'Conteúdo no planner 🎬')
    }
    closeSheet()
  }

  const remove = () => {
    if (!id) return
    closeSheet()
    removeWithUndo('contentItems', id, 'Conteúdo apagado')
  }

  return (
    <SheetLayout
      eyebrow={existing ? (existing.stage === 'ideia' ? 'Ideia' : 'Conteúdo') : 'Novo conteúdo'}
      title={existing ? undefined : 'O que vamos criar?'}
      onClose={closeSheet}
      onDelete={existing ? remove : undefined}
      primary={{ label: existing ? 'Salvar' : 'Adicionar', onClick: save, disabled: !canSave }}
    >
      <TitleInput
        autoFocus={!existing}
        placeholder="Título ou ideia"
        value={draft.title}
        onChange={(e) => set({ title: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        aria-label="Título"
      />
      <Group label="Etapa">
        <ChipSelect value={draft.stage} onChange={(v) => v && set({ stage: v })} options={STAGE_OPTIONS} />
      </Group>

      <MoreOptions defaultOpen={hasDetails}>
        <Group label="Formato">
          <ChipSelect clearable value={draft.format} onChange={(v) => set({ format: v })} options={FORMAT_OPTIONS} />
        </Group>
        <Group label="Plataforma">
          <ChipSelect clearable value={draft.platform} onChange={(v) => set({ platform: v })} options={PLATFORM_OPTIONS} />
        </Group>
        <Group label="Categoria">
          <ChipSelect clearable value={draft.category} onChange={(v) => set({ category: v })} options={CATEGORY_OPTIONS} />
        </Group>
        <Field label="Hook" hint="a primeira frase que segura o dedo">
          <TextInput placeholder="ex.: 5h da manhã e eu já…" value={draft.hook ?? ''} onChange={(e) => set({ hook: e.target.value })} />
        </Field>
        <Field label="Roteiro">
          <TextArea rows={6} placeholder="cenas, falas, ordem…" value={draft.script ?? ''} onChange={(e) => set({ script: e.target.value })} />
        </Field>
        <Field label="Assets">
          <TextArea rows={2} placeholder="takes, fotos, músicas, b-roll" value={draft.assets ?? ''} onChange={(e) => set({ assets: e.target.value })} />
        </Field>
        <Field label="CTA">
          <TextInput placeholder="ex.: salva pra lembrar depois" value={draft.cta ?? ''} onChange={(e) => set({ cta: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prazo">
            <DateInput value={draft.deadline} onChange={(v) => set({ deadline: v })} />
          </Field>
          <Field label="Parceria">
            <Select
              value={draft.partnershipId}
              onChange={(v) => set({ partnershipId: v })}
              options={partnershipOptions}
              placeholder={partnershipOptions.length ? 'nenhuma' : 'sem parcerias'}
            />
          </Field>
        </div>
        <Group label="Links">
          <LinksEditor value={draft.links} onChange={(links) => set({ links })} />
        </Group>
      </MoreOptions>
    </SheetLayout>
  )
}
