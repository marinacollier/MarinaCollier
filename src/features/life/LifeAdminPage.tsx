import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { LifeAdminCategory, Task } from '@/data/types'
import { Card, Checkbox, Chip, EmptyState, IconButton, Page, PageHeader, SectionTitle, SwipeRow } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { haptic } from '@/lib/haptics'
import { nowISO } from '@/lib/id'
import { cn } from '@/lib/cn'
import {
  ADMIN_KINDS,
  adminKindMeta,
  groupLifeAdmin,
  LIFE_CATEGORIES,
  LIFE_GROUPS,
  lifeCategoryCounts,
  lifeCategoryMeta,
  lifeCategoryOf,
  lifeKindCounts,
  lifeTaskDefaults,
  OTHER_CATEGORY,
  type AdminKind,
  type LifeItem,
} from './selectors'

function complete(item: LifeItem, today: string) {
  const t = item.task
  if (t.recurrence) {
    const done = actions.toggleOccurrence('task', t.id, today)
    if (done) {
      haptic('success')
      toast('Feito ✓ até a próxima')
    }
    return
  }
  if (t.status === 'done') {
    actions.update('tasks', t.id, { status: 'todo', completedAt: undefined })
    return
  }
  const prev = t.status
  actions.update('tasks', t.id, { status: 'done', completedAt: nowISO() })
  haptic('success')
  toast('Uma coisa a menos 🙌', {
    action: { label: 'Desfazer', run: () => actions.update('tasks', t.id, { status: prev, completedAt: undefined }) },
  })
}

/** Where a category's "bigger" planning lives (link, not duplication). */
const CATEGORY_LINKS: Partial<Record<LifeAdminCategory, { label: string; to: string }>> = {
  luna: { label: 'rotina e áreas da Luna', to: ROUTES.luna },
  viagens: { label: 'planejamento de cada viagem', to: ROUTES.trips },
}

export default function LifeAdminPage() {
  const db = useDB()
  const today = useToday()
  const nav = useNavigate()
  const [cat, setCat] = useState<LifeAdminCategory | undefined>()
  const [kind, setKind] = useState<AdminKind | undefined>()
  const groups = useMemo(() => groupLifeAdmin(db, today, { category: cat, kind }), [db, today, cat, kind])
  const counts = useMemo(() => lifeCategoryCounts(db, today), [db, today])
  const kindCounts = useMemo(() => lifeKindCounts(db, today, cat), [db, today, cat])
  const total = LIFE_GROUPS.reduce((n, g) => n + groups[g.id].length, 0)
  const anyInCat = Object.values(kindCounts).some(Boolean)
  const catMeta = cat ? lifeCategoryMeta(cat) : undefined
  const cats = LIFE_CATEGORIES
  const showOther = !!counts.outros || cat === 'outros'
  const link = cat ? CATEGORY_LINKS[cat] : undefined

  const openAdd = (k: AdminKind | undefined = kind) => openSheet('task', { defaults: lifeTaskDefaults(cat, k, today) })
  const pickCat = (c: LifeAdminCategory) => {
    setCat(cat === c ? undefined : c)
    setKind(undefined)
  }

  return (
    <Page>
      <PageHeader
        back
        backTo={ROUTES.life}
        eyebrow="Vida"
        title="Vida real"
        subtitle="casa, esportes, papéis — tá tudo aí, sem pressa"
        actions={
          <IconButton label="Adicionar" onClick={() => openAdd()}>
            <Plus size={22} />
          </IconButton>
        }
      />

      <div className="grid grid-cols-4 gap-2">
        {cats.map((c, i) => {
          const on = cat === c.value
          const n = counts[c.value]
          return (
            <motion.button
              key={c.value}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 * i, duration: 0.25 }}
              aria-pressed={on}
              onClick={() => pickCat(c.value)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 rounded-2xl min-h-[76px] px-1 py-2 border transition active:scale-[0.97]',
                on ? 'bg-ink text-bg border-ink' : 'bg-surface border-line/70 text-ink',
              )}
            >
              <span className="text-[22px] leading-none" aria-hidden>
                {c.emoji}
              </span>
              <span className={cn('text-[12px] leading-tight text-center', on ? 'text-bg' : 'text-ink-2')}>{c.label}</span>
              {!!n && (
                <span
                  className={cn(
                    'absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-medium flex items-center justify-center tabular-nums',
                    on ? 'bg-bg/20 text-bg' : 'bg-accent-soft text-accent',
                  )}
                >
                  {n}
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      {showOther && (
        <button
          type="button"
          aria-pressed={cat === 'outros'}
          onClick={() => pickCat('outros')}
          className={cn(
            'mt-2 w-full flex items-center gap-2 rounded-2xl px-4 min-h-11 border text-[13.5px] text-left transition active:scale-[0.99]',
            cat === 'outros' ? 'bg-ink text-bg border-ink' : 'bg-surface border-line/70 text-ink-2',
          )}
        >
          <span aria-hidden>{OTHER_CATEGORY.emoji}</span>
          <span className="flex-1">{OTHER_CATEGORY.label}</span>
          {!!counts.outros && <span className={cn('text-[12px] tabular-nums', cat === 'outros' ? 'opacity-70' : 'text-muted')}>{counts.outros}</span>}
        </button>
      )}

      {catMeta && (
        <div className="mt-4 flex items-baseline justify-between gap-3 px-1">
          <div className="min-w-0">
            <div className="font-display text-[22px] leading-tight">
              {catMeta.emoji} {catMeta.label}
            </div>
            <div className="text-[13px] text-muted">{catMeta.hint}</div>
          </div>
          <button type="button" onClick={() => setCat(undefined)} className="text-[13px] text-ink-2 underline underline-offset-2 shrink-0 min-h-9">
            ver tudo
          </button>
        </div>
      )}
      {link && (
        <button
          type="button"
          onClick={() => nav(link.to)}
          className="mt-2 w-full flex items-center gap-2 rounded-2xl bg-surface-2 px-4 min-h-11 text-[13.5px] text-ink-2 text-left active:bg-line"
        >
          <span className="flex-1">{link.label}</span>
          <ChevronRight size={16} className="text-muted" />
        </button>
      )}

      <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        <Chip selected={!kind} onClick={() => setKind(undefined)}>
          Tudo
        </Chip>
        {ADMIN_KINDS.map((k) => (
          <Chip key={k.value} selected={kind === k.value} onClick={() => setKind(kind === k.value ? undefined : k.value)}>
            <span aria-hidden>{k.emoji}</span>
            {k.label}
            {!!kindCounts[k.value] && <span className={cn('text-[12px]', kind === k.value ? 'opacity-70' : 'text-muted')}>{kindCounts[k.value]}</span>}
          </Chip>
        ))}
      </div>

      <QuickAdd category={cat} kind={kind} today={today} key={`${cat ?? 'all'}-${kind ?? 'all'}`} />

      {total === 0 ? (
        <Card className="mt-5">
          <EmptyState
            emoji={kind ? adminKindMeta(kind).emoji : (catMeta?.emoji ?? '🏠')}
            title={emptyTitle(catMeta?.label, kind, anyInCat)}
            text={cat ? 'Quando lembrar de algo, joga aqui. Fica guardado, sem cobrança.' : 'Escolhe uma área ali em cima ou anota direto. Sem pressa.'}
            action={
              cat && (
              <div className="flex flex-wrap justify-center gap-2">
                {ADMIN_KINDS.filter((k) => !kind || k.value === kind).map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => openAdd(k.value)}
                    className="inline-flex items-center gap-1 h-9 px-3.5 rounded-full bg-surface-2 text-[13px] text-ink-2 active:bg-line"
                  >
                    <Plus size={13} />
                    {k.add}
                  </button>
                ))}
              </div>
              )
            }
          />
        </Card>
      ) : (
        LIFE_GROUPS.map((g) =>
          groups[g.id].length ? (
            <section key={g.id}>
              <SectionTitle>
                {g.title} <span className="text-muted/70 normal-case tracking-normal font-normal">· {groups[g.id].length}</span>
              </SectionTitle>
              {g.hint && <p className="text-[12.5px] text-muted px-1 -mt-1.5 mb-2.5">{g.hint}</p>}
              <div className="card overflow-hidden">
                <AnimatePresence initial={false}>
                  {groups[g.id].map((it, i) => (
                    <motion.div
                      key={it.task.id}
                      layout="position"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22 }}
                      className={cn(i > 0 && 'border-t border-line/70')}
                    >
                      <LifeRow item={it} today={today} showCategory={!cat} showKind={!kind && g.id !== 'waiting'} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          ) : null,
        )
      )}
    </Page>
  )
}

function emptyTitle(cat: string | undefined, kind: AdminKind | undefined, anyInCat: boolean): string {
  if (kind) {
    const k = adminKindMeta(kind)
    const where = cat ? ` em ${cat.toLowerCase()}` : ''
    return kind === 'waiting' ? `Ninguém te devendo nada${where}` : `Nada pra ${k.add}${where}`
  }
  if (cat) return anyInCat ? `${cat} em dia ✨` : `${cat} tá tranquilo`
  return 'Nada pedindo tua atenção aqui. Delícia.'
}

function LifeRow({ item, today, showCategory, showKind }: { item: LifeItem; today: string; showCategory: boolean; showKind: boolean }) {
  const t: Task = item.task
  const meta = lifeCategoryMeta(lifeCategoryOf(t))
  const kind = adminKindMeta(item.kind)
  const checked = item.doneToday
  const sub = [showCategory ? meta.label : undefined, showKind ? kind.label.toLowerCase() : undefined, item.detail].filter(Boolean).join(' · ')
  return (
    <SwipeRow
      className="rounded-none"
      onComplete={() => complete(item, today)}
      completeLabel={checked ? 'Desmarcar' : 'Feito'}
      onDelete={() => removeWithUndo('tasks', t.id, 'Apagado')}
    >
      <div className="flex items-center gap-3 min-h-[60px] px-4 py-2.5">
        <Checkbox checked={checked} label={checked ? `Desmarcar ${t.title}` : `Concluir ${t.title}`} onChange={() => complete(item, today)} />
        <button type="button" onClick={() => openSheet('task', { id: t.id })} className="flex-1 min-w-0 flex items-center gap-3 text-left">
          <span aria-hidden className="text-[18px] shrink-0">
            {showCategory ? meta.emoji : kind.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn('block text-[15px] leading-snug', checked && 'text-muted line-through decoration-muted/50')}>{t.title}</span>
            {sub && <span className="block text-[12.5px] text-muted mt-0.5 truncate">{sub}</span>}
          </span>
        </button>
      </div>
    </SwipeRow>
  )
}

function QuickAdd({ category, kind, today }: { category?: LifeAdminCategory; kind?: AdminKind; today: string }) {
  const [text, setText] = useState('')
  const meta = category ? lifeCategoryMeta(category) : undefined
  const k = kind ? adminKindMeta(kind) : undefined
  const submit = () => {
    const title = text.trim()
    if (!title) return
    const d = lifeTaskDefaults(category, kind, today)
    actions.create('tasks', {
      ...d,
      title,
      status: d.status ?? 'todo',
      order: nextOrder(getDB().tasks),
    })
    haptic('light')
    toast(meta ? `Anotado em ${meta.label} ✓` : 'Anotado ✓')
    setText('')
  }
  const placeholder =
    kind === 'waiting'
      ? 'Esperando o quê / de quem?'
      : kind === 'comprar'
        ? `Comprar${meta ? ` pra ${meta.label.toLowerCase()}` : ''}…`
        : kind === 'manutencao'
          ? `Manutenção${meta ? ` de ${meta.label.toLowerCase()}` : ''}…`
          : meta
            ? `Algo de ${meta.label.toLowerCase()}…`
            : 'Lembrei de uma coisa…'
  return (
    <form
      className="mt-3 flex items-center gap-2 rounded-2xl bg-surface border border-line/70 pl-4 pr-1.5 min-h-[52px] focus-within:border-accent/50 transition-colors"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <span aria-hidden className="text-[17px]">
        {k?.emoji ?? meta?.emoji ?? '+'}
      </span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent outline-none py-3 placeholder:text-muted"
        enterKeyHint="done"
        aria-label="Adicionar rapidinho"
      />
      <AnimatePresence>
        {text.trim() && (
          <motion.button
            type="submit"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="h-10 px-4 rounded-full bg-ink text-bg text-[13px] font-medium"
          >
            Adicionar
          </motion.button>
        )}
      </AnimatePresence>
    </form>
  )
}
