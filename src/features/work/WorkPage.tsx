import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clapperboard, Inbox, Plus, Sparkles } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { actions, useDB } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { isTaskOpen } from '@/data/selectors'
import { cn } from '@/lib/cn'
import { pluralize } from '@/lib/text'
import { EmptyState, IconButton, ListCard, ListRow, Page, PageHeader, SectionTitle, SortableList } from '@/components/ui'
import { CALM_EMPTY, inboxKindLabel, INBOX_SOURCES } from './constants'
import { CappedList, Reveal, Tag } from './components'
import {
  attentionItems,
  inboxNew,
  laterDeadlines,
  projectLastUpdate,
  splitProjects,
  thisWeekItems,
  todayWorkTasks,
  updatedAgoLabel,
  waitingWork,
  winsSorted,
  receivedLabel,
} from './selectors'
import { WorkTaskRow } from './WorkTaskRow'
import { WaitingRow } from './WaitingRow'
import { DatedRow, ProjectCard } from './WorkParts'
import { RitualsCard } from './RitualsCard'
import { upcomingRituals } from './rituals'

export default function WorkPage() {
  const db = useDB()
  const today = useToday()
  const nav = useNavigate()
  const [showResting, setShowResting] = useState(false)

  const attention = useMemo(() => attentionItems(db), [db])
  const todayTasks = useMemo(() => todayWorkTasks(db, today), [db, today])
  const week = useMemo(() => thisWeekItems(db, today), [db, today])
  const waiting = useMemo(() => waitingWork(db), [db])
  const later = useMemo(() => laterDeadlines(db, today), [db, today])
  const { live, resting } = useMemo(() => splitProjects(db), [db])
  const newInbox = useMemo(() => inboxNew(db).length, [db])
  const rituals = useMemo(() => upcomingRituals(db, today), [db, today])
  const ritualToday = rituals.some((r) => r.date === today)
  const lastWins = useMemo(() => winsSorted(db.wins).slice(0, 3), [db.wins])
  const openCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of db.tasks) if (t.projectId && isTaskOpen(t) && t.status !== 'waiting') m.set(t.projectId, (m.get(t.projectId) ?? 0) + 1)
    return m
  }, [db.tasks])
  const updated = useMemo(() => new Map(db.projects.map((p) => [p.id, projectLastUpdate(db, p.id)])), [db])

  const subtitle =
    attention.length > 0
      ? `${pluralize(live.length, 'frente ativa', 'frentes ativas')} · ${pluralize(attention.length, 'coisa precisa', 'coisas precisam')} de você`
      : `${pluralize(live.length, 'frente ativa', 'frentes ativas')} · nada urgente pedindo você`

  let delay = 0
  const next = () => (delay += 0.04)

  return (
    <Page>
      <PageHeader
        eyebrow="Work OS"
        title="Trabalho"
        subtitle={subtitle}
        actions={
          <IconButton label="Nova tarefa de trabalho" onClick={() => openSheet('task', { defaults: { context: 'trabalho', area: 'profissional', date: today } })}>
            <Plus size={22} />
          </IconButton>
        }
      />

      {/* PRECISA DE MIM */}
      <Reveal>
        <SectionTitle className="mt-2">Precisa de mim</SectionTitle>
        {attention.length === 0 ? (
          <div className="card">
            <EmptyState compact emoji="☕" title="Tudo tranquilo" text={CALM_EMPTY} />
          </div>
        ) : (
          <ListCard>
            <CappedList
              items={attention}
              render={(a) =>
                a.type === 'task' ? (
                  <WorkTaskRow key={a.id} task={a.task} today={today} />
                ) : (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => nav(ROUTES.workInbox)}
                    className="w-full flex items-start gap-3 px-4 py-3 min-h-[56px] text-left active:bg-surface-2"
                  >
                    <span className="h-8 w-8 rounded-full bg-ocean-soft text-ocean inline-flex items-center justify-center shrink-0 mt-0.5">
                      <Inbox size={15} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] leading-snug">{a.item.subject}</span>
                      <span className="flex items-center gap-1.5 mt-1 text-[12.5px] text-muted">
                        <Tag className={INBOX_SOURCES[a.item.source].cls}>{INBOX_SOURCES[a.item.source].label}</Tag>
                        <Tag>{inboxKindLabel(a.item.kind)}</Tag>
                        <span className="truncate">{[a.item.sender, receivedLabel(a.item.receivedAt, today)].filter(Boolean).join(' · ')}</span>
                      </span>
                    </span>
                  </button>
                )
              }
              className="divide-y divide-line/70"
            />
          </ListCard>
        )}
      </Reveal>

      {/* RITUAIS (em destaque no dia) */}
      {ritualToday && (
        <Reveal delay={next()}>
          <SectionTitle>Rituais</SectionTitle>
          <RitualsCard rituals={rituals} today={today} />
        </Reveal>
      )}

      {/* HOJE */}
      {todayTasks.length > 0 && (
        <Reveal delay={next()}>
          <SectionTitle>Hoje</SectionTitle>
          <ListCard>
            <CappedList items={todayTasks} render={(t) => <WorkTaskRow key={t.id} task={t} today={today} />} className="divide-y divide-line/70" />
          </ListCard>
        </Reveal>
      )}

      {/* ESTA SEMANA */}
      {week.length > 0 && (
        <Reveal delay={next()}>
          <SectionTitle>Esta semana</SectionTitle>
          <ListCard>
            <CappedList items={week} render={(i) => <DatedRow key={i.key} item={i} today={today} />} className="divide-y divide-line/70" />
          </ListCard>
        </Reveal>
      )}

      {/* WAITING FOR */}
      {waiting.length > 0 && (
        <Reveal delay={next()}>
          <SectionTitle>Waiting for</SectionTitle>
          <ListCard>
            <CappedList limit={3} items={waiting} render={(t) => <WaitingRow key={t.id} task={t} today={today} />} className="divide-y divide-line/70" />
          </ListCard>
        </Reveal>
      )}

      {/* DEADLINES */}
      {later.length > 0 && (
        <Reveal delay={next()}>
          <SectionTitle>Deadlines</SectionTitle>
          <ListCard>
            <CappedList items={later} render={(i) => <DatedRow key={i.key} item={i} today={today} />} className="divide-y divide-line/70" />
          </ListCard>
        </Reveal>
      )}

      {/* RITUAIS */}
      {!ritualToday && rituals.length > 0 && (
        <Reveal delay={next()}>
          <SectionTitle>Rituais</SectionTitle>
          <RitualsCard rituals={rituals} today={today} />
        </Reveal>
      )}

      {/* PROJETOS */}
      <Reveal delay={next()}>
        <SectionTitle
          action={
            <button type="button" onClick={() => openSheet('project')} className="h-9 -my-2 px-2 text-[13px] text-accent font-medium flex items-center gap-1">
              <Plus size={15} /> projeto
            </button>
          }
        >
          Projetos
        </SectionTitle>
        {live.length === 0 ? (
          <div className="card">
            <EmptyState compact emoji="🌱" title="Nenhuma frente ativa" text="Quando começar algo novo, é só adicionar." />
          </div>
        ) : (
          <SortableList
            items={live}
            onReorder={(ids) => actions.reorder('projects', [...ids, ...resting.map((p) => p.id)])}
            renderItem={(p, handle) => (
              <ProjectCard project={p} today={today} updatedLabel={updatedAgoLabel(updated.get(p.id), today)} openCount={openCounts.get(p.id)} handle={handle} />
            )}
          />
        )}
        {resting.length > 0 && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setShowResting((s) => !s)}
              className="w-full h-11 text-[13px] text-muted flex items-center justify-center"
              aria-expanded={showResting}
            >
              {showResting ? 'esconder pausados e concluídos' : `${pluralize(resting.length, 'projeto pausado ou concluído', 'projetos pausados ou concluídos')}`}
            </button>
            {showResting && (
              <ListCard>
                {resting.map((p) => (
                  <ListRow
                    key={p.id}
                    leading={<span className="text-[20px]">{p.emoji}</span>}
                    title={p.name}
                    subtitle={[p.status === 'pausado' ? 'pausado' : 'concluído', p.role].filter(Boolean).join(' · ')}
                    onPress={() => nav(ROUTES.project(p.id))}
                    chevron
                  />
                ))}
              </ListCard>
            )}
          </div>
        )}
      </Reveal>

      {/* ENTRADAS */}
      <Reveal delay={next()}>
        <SectionTitle>Mais do trabalho</SectionTitle>
        <ListCard>
          <ListRow
            leading={<EntryIcon className="bg-ocean-soft text-ocean"><Inbox size={17} /></EntryIcon>}
            title="Work Inbox"
            subtitle={newInbox ? `${newInbox} para decidir` : 'nada para decidir agora'}
            onPress={() => nav(ROUTES.workInbox)}
            chevron
          />
          <ListRow
            leading={<EntryIcon className="bg-sand-soft text-sand"><Sparkles size={17} /></EntryIcon>}
            title="Wins ✨"
            subtitle={lastWins.length ? lastWins.map((w) => w.title).join(' · ') : 'suas conquistas guardadas com carinho'}
            onPress={() => nav(ROUTES.wins)}
            chevron
          />
          <ListRow
            leading={<EntryIcon className="bg-plum-soft text-plum"><Clapperboard size={17} /></EntryIcon>}
            title="Creator / UGC"
            subtitle="ideias, conteúdos e parcerias"
            onPress={() => nav(ROUTES.creator)}
            chevron
          />
        </ListCard>
      </Reveal>
    </Page>
  )
}

function EntryIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('h-9 w-9 rounded-full inline-flex items-center justify-center', className)}>{children}</span>
}
