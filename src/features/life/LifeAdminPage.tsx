import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
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
  groupLifeAdmin,
  LIFE_CATEGORIES,
  LIFE_GROUPS,
  lifeCategoryCounts,
  lifeCategoryMeta,
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

export default function LifeAdminPage() {
  const db = useDB()
  const today = useToday()
  const [cat, setCat] = useState<LifeAdminCategory | undefined>()
  const groups = useMemo(() => groupLifeAdmin(db, today, cat), [db, today, cat])
  const counts = useMemo(() => lifeCategoryCounts(db, today), [db, today])
  const total = LIFE_GROUPS.reduce((n, g) => n + groups[g.id].length, 0)
  const catMeta = cat ? lifeCategoryMeta(cat) : undefined

  const add = () =>
    openSheet('task', { defaults: { context: 'vida_real', lifeAdminCategory: cat ?? 'outros', bucket: 'semana' } })

  return (
    <Page>
      <PageHeader
        back
        backTo={ROUTES.life}
        eyebrow="Vida"
        title="Vida real"
        subtitle="casa, carro, papéis e afins — sem pressa"
        actions={
          <IconButton label="Adicionar" onClick={add}>
            <Plus size={22} />
          </IconButton>
        }
      />

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        <Chip selected={!cat} onClick={() => setCat(undefined)}>
          Tudo
        </Chip>
        {LIFE_CATEGORIES.map((c) => (
          <Chip key={c.value} selected={cat === c.value} onClick={() => setCat(cat === c.value ? undefined : c.value)}>
            <span aria-hidden>{c.emoji}</span>
            {c.label}
            {!!counts[c.value] && <span className={cn('text-[12px]', cat === c.value ? 'opacity-70' : 'text-muted')}>{counts[c.value]}</span>}
          </Chip>
        ))}
      </div>

      <QuickAdd category={cat} key={cat ?? 'all'} />

      {total === 0 ? (
        <Card className="mt-5">
          <EmptyState
            emoji={catMeta?.emoji ?? '🏡'}
            title={catMeta ? `Nada em ${catMeta.label.toLowerCase()}` : 'Tudo em ordem por aqui'}
            text="Quando lembrar de algo da vida prática, joga aqui em cima. Sem pressa."
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
                      <LifeRow item={it} today={today} showCategory={!cat} />
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

function LifeRow({ item, today, showCategory }: { item: LifeItem; today: string; showCategory: boolean }) {
  const t: Task = item.task
  const meta = lifeCategoryMeta(t.lifeAdminCategory)
  const checked = item.doneToday
  return (
    <SwipeRow
      className="rounded-none"
      onComplete={() => complete(item, today)}
      completeLabel={checked ? 'Desmarcar' : 'Feito'}
      onDelete={() => removeWithUndo('tasks', t.id, 'Apagado')}
    >
      <div className="flex items-center gap-3 min-h-[60px] px-4 py-2.5">
        <Checkbox checked={checked} label={checked ? `Desmarcar ${t.title}` : `Concluir ${t.title}`} onChange={() => complete(item, today)} />
        <button
          type="button"
          onClick={() => openSheet('task', { id: t.id })}
          className="flex-1 min-w-0 flex items-center gap-3 text-left"
        >
          {showCategory && (
            <span aria-hidden className="text-[18px] shrink-0">
              {meta.emoji}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className={cn('block text-[15px] leading-snug', checked && 'text-muted line-through decoration-muted/50')}>{t.title}</span>
            <span className="block text-[12.5px] text-muted mt-0.5 truncate">
              {showCategory ? [meta.label, item.detail].filter(Boolean).join(' · ') : item.detail || meta.label}
            </span>
          </span>
        </button>
      </div>
    </SwipeRow>
  )
}

function QuickAdd({ category }: { category?: LifeAdminCategory }) {
  const [text, setText] = useState('')
  const meta = category ? lifeCategoryMeta(category) : undefined
  const submit = () => {
    const title = text.trim()
    if (!title) return
    actions.create('tasks', {
      title,
      status: 'todo',
      context: 'vida_real',
      lifeAdminCategory: category ?? 'outros',
      bucket: 'semana',
      order: nextOrder(getDB().tasks),
    })
    haptic('light')
    toast(meta ? `Anotado em ${meta.label} ✓` : 'Anotado ✓')
    setText('')
  }
  return (
    <form
      className="mt-3 flex items-center gap-2 rounded-2xl bg-surface border border-line/70 pl-4 pr-1.5 min-h-[52px] focus-within:border-accent/50 transition-colors"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <span aria-hidden className="text-[17px]">{meta?.emoji ?? '+'}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={meta ? `Algo de ${meta.label.toLowerCase()}…` : 'Lembrei de uma coisa…'}
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
