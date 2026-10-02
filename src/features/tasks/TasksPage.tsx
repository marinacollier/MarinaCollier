import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Plus } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { Button, Chip, EmptyState, IconButton, Page, PageHeader, SectionTitle } from '@/components/ui'
import { useDB } from '@/data/store'
import { carriedOverTasks } from '@/data/selectors'
import { useToday } from '@/hooks/useToday'
import { cn } from '@/lib/cn'
import { CONTEXT_EMOJI, CONTEXT_LABEL, contextOf, groupTasks, type TaskContext, type TaskSectionId } from './groups'
import { TaskRow } from './TaskRow'

const SECTION_HINT: Partial<Record<TaskSectionId, string>> = {
  esperando: 'depende de outra pessoa',
  revisar: 'conferir antes de assumir',
  algum_dia: 'quando der, sem pressa',
}

export default function TasksPage() {
  const db = useDB()
  const today = useToday()
  const [context, setContext] = useState<TaskContext | undefined>()
  const [showDone, setShowDone] = useState(false)

  const sections = useMemo(() => groupTasks(db, today, context), [db, today, context])
  const carriedIds = useMemo(() => new Set(carriedOverTasks(db, today).map((t) => t.id)), [db, today])
  const usedContexts = useMemo(() => {
    const s = new Set(db.tasks.filter((t) => t.status !== 'archived').map(contextOf))
    return (Object.keys(CONTEXT_LABEL) as TaskContext[]).filter((c) => s.has(c))
  }, [db.tasks])

  const openCount = sections.filter((s) => s.id !== 'feitas').reduce((n, s) => n + s.tasks.length, 0)
  const done = sections.find((s) => s.id === 'feitas')!

  return (
    <Page>
      <PageHeader
        back
        title="Tarefas"
        subtitle="Tudo num lugar só. Um passo de cada vez."
        actions={
          <IconButton label="Nova tarefa" onClick={() => openSheet('task', { defaults: context ? { context } : undefined })}>
            <Plus size={22} />
          </IconButton>
        }
      />

      {usedContexts.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
          <Chip selected={!context} onClick={() => setContext(undefined)}>
            Todas
          </Chip>
          {usedContexts.map((c) => (
            <Chip key={c} selected={context === c} onClick={() => setContext(context === c ? undefined : c)}>
              <span aria-hidden>{CONTEXT_EMOJI[c]}</span> {CONTEXT_LABEL[c]}
            </Chip>
          ))}
        </div>
      )}

      {openCount === 0 && done.tasks.length === 0 ? (
        <EmptyState
          emoji="🌿"
          title={context ? `Nada em ${CONTEXT_LABEL[context].toLowerCase()} por aqui` : 'Nada pedindo tua atenção aqui. Delícia.'}
          text="Quando surgir algo, é só anotar."
          action={
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => openSheet('task', { defaults: context ? { context } : undefined })}>
              Nova tarefa
            </Button>
          }
        />
      ) : (
        sections
          .filter((s) => s.id !== 'feitas' && s.tasks.length > 0)
          .map((s, i) => (
            <motion.section key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.3 }}>
              <SectionTitle className={i === 0 ? 'mt-4' : undefined}>
                {s.title}
                <span className="ml-2 normal-case tracking-normal font-normal text-muted/80">
                  {s.tasks.length}
                  {SECTION_HINT[s.id] && ` · ${SECTION_HINT[s.id]}`}
                </span>
              </SectionTitle>
              <div className="card overflow-hidden divide-y divide-line/70">
                {s.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} date={today} note={s.id === 'hoje' && carriedIds.has(t.id) ? 'ficou de antes' : undefined} showContext={!context} />
                ))}
              </div>
            </motion.section>
          ))
      )}

      {done.tasks.length > 0 && (
        <section className="mt-7">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex items-center gap-1.5 px-1 h-10 eyebrow"
            aria-expanded={showDone}
          >
            Feitas recentemente · {done.tasks.length}
            <ChevronDown size={14} className={cn('transition-transform', showDone && 'rotate-180')} />
          </button>
          {showDone && (
            <div className="card overflow-hidden divide-y divide-line/70 mt-1">
              {done.tasks.map((t) => (
                <TaskRow key={t.id} task={t} date={today} showContext={!context} />
              ))}
            </div>
          )}
        </section>
      )}

      {openCount > 0 && (
        <p className="text-center text-[12.5px] text-muted mt-8">deslize → para concluir · ← para apagar</p>
      )}
    </Page>
  )
}
