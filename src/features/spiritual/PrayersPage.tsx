/** Diário de oração: nova oração, anteriores, intenções, gratidão, reflexões. Private, on her device. */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { Button, Card, ChipSelect, EmptyState, Page, PageHeader, Segmented, TextArea, TextInput } from '@/components/ui'
import { actions, persist, useDB } from '@/data/store'
import { savePrayer } from '@/data/spiritual/ops'
import type { SpiritualPrayer, SpiritualPrayerCategory } from '@/data/types'
import { formatShortDate, toDateKey } from '@/lib/date'
import { Prose } from './parts'

const CATEGORIES: { value: SpiritualPrayerCategory; label: string }[] = [
  { value: 'oracao', label: 'Oração' },
  { value: 'intencao', label: 'Intenção' },
  { value: 'gratidao', label: 'Gratidão' },
  { value: 'reflexao', label: 'Reflexão' },
]
type Tab = 'todas' | SpiritualPrayerCategory
const TABS: { value: Tab; label: string }[] = [
  { value: 'todas', label: 'Anteriores' },
  { value: 'oracao', label: 'Orações' },
  { value: 'intencao', label: 'Intenções' },
  { value: 'gratidao', label: 'Gratidão' },
  { value: 'reflexao', label: 'Reflexões' },
]
const LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<SpiritualPrayerCategory, string>

export default function PrayersPage() {
  const prayers = useDB((db) => db.spiritualPrayers)
  const [params, setParams] = useSearchParams()
  const raw = params.get('aba') as Tab | null
  const tab: Tab = TABS.some((t) => t.value === raw) ? raw! : 'todas'
  const list = useMemo(
    () => [...prayers].filter((p) => tab === 'todas' || p.category === tab).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [prayers, tab],
  )
  return (
    <Page>
      <PageHeader title="Diário de oração" eyebrow="Bíblia, Graça & Liberdade" back backTo={ROUTES.bible} />
      <PrayerForm key={prayers.length} initialCategory={tab === 'todas' ? 'oracao' : tab} />
      <Segmented variant="tabs" value={tab} onChange={(t) => setParams(t === 'todas' ? {} : { aba: t }, { replace: true })} options={TABS} className="mt-6 mb-4" />
      {list.length ? (
        <div className="grid gap-3">
          {list.map((p) => (
            <PrayerCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <EmptyState compact emoji="🕯️" title="Nada aqui ainda" text="Quando quiser, escreva acima." />
      )}
    </Page>
  )
}

function PrayerForm({ p, initialCategory = 'oracao', onDone }: { p?: SpiritualPrayer; initialCategory?: SpiritualPrayerCategory; onDone?: () => void }) {
  const [title, setTitle] = useState(p?.title ?? '')
  const [content, setContent] = useState(p?.content ?? '')
  const [category, setCategory] = useState<SpiritualPrayerCategory>(p?.category ?? initialCategory)
  const save = () => {
    if (!savePrayer({ title, content, category }, p?.id)) return
    void persist()
    toast(p ? 'Atualizado' : 'Guardado no diário')
    onDone?.()
  }
  return (
    <Card className="space-y-3">
      {!p && <div className="eyebrow">Nova</div>}
      <ChipSelect value={category} onChange={(v) => v && setCategory(v)} options={CATEGORIES} />
      <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" />
      <TextArea rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escreva com calma…" />
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" disabled={!content.trim()} onClick={save}>
          {p ? 'Salvar' : 'Guardar'}
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        )}
      </div>
    </Card>
  )
}

function PrayerCard({ p }: { p: SpiritualPrayer }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <PrayerForm p={p} onDone={() => setEditing(false)} />
  const remove = () => {
    const gone = actions.remove('spiritualPrayers', p.id)
    void persist()
    if (gone)
      toast('Removido', {
        action: {
          label: 'Desfazer',
          run: () => {
            actions.restore('spiritualPrayers', gone)
            void persist()
          },
        },
      })
  }
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-muted">
            {LABEL[p.category]} · {formatShortDate(toDateKey(new Date(p.createdAt)))}
          </div>
          {p.title && <div className="font-display text-[19px] mt-0.5">{p.title}</div>}
        </div>
        <div className="flex shrink-0 -mr-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={remove}>
            Apagar
          </Button>
        </div>
      </div>
      <Prose text={p.content} className="mt-2 text-[15px]" />
    </Card>
  )
}
