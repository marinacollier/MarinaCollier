import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Clapperboard, Map as MapIcon, Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { useDB } from '@/data/store'
import type { DateKey, Project } from '@/data/types'
import { DateInput, ListCard } from '@/components/ui'
import { formatShortDate, relativeDay } from '@/lib/date'
import { pluralize } from '@/lib/text'
import { winKind } from './constants'
import { CappedList, InlineEdit, Tag } from './components'
import { updateProject } from './mutations'
import { roadmapCounts } from './roadmap'
import { capOverloads, dueLabel, minutesLabel, projectTimeCap, projectTodayTasks, projectWeek, sortedLog, waitingWork, winsSorted } from './selectors'
import { WaitingRow } from './WaitingRow'
import { DatedRow } from './WorkParts'
import { WorkTaskRow } from './WorkTaskRow'

export type ProjectTab =
  | 'geral'
  | 'tarefas'
  | 'roadmap'
  | 'waiting'
  | 'pessoas'
  | 'links'
  | 'notas'
  | 'decisoes'
  | 'changelog'
  | 'reunioes'
  | 'wins'

/** Small section of the project home: eyebrow + actions, content or one quiet line. */
function HomeSection({
  title,
  quiet,
  empty,
  onAdd,
  addLabel,
  onMore,
  alwaysMore,
  children,
}: {
  title: string
  quiet: string
  empty: boolean
  onAdd?: () => void
  addLabel?: string
  onMore?: () => void
  /** Show "ver tudo" even when the section itself is empty. */
  alwaysMore?: boolean
  children?: ReactNode
}) {
  return (
    <section className="mt-6" aria-label={title}>
      <div className="flex items-center justify-between px-1 mb-2 min-h-9">
        <h2 className="eyebrow">{title}</h2>
        <div className="flex items-center -mr-2">
          {onMore && (!empty || alwaysMore) && (
            <button type="button" onClick={onMore} className="h-9 px-2 text-[13px] text-muted active:text-ink">
              ver tudo
            </button>
          )}
          {onAdd && (
            <button type="button" onClick={onAdd} aria-label={addLabel} className="h-9 w-9 inline-flex items-center justify-center text-accent rounded-full active:bg-surface-2">
              <Plus size={18} />
            </button>
          )}
        </div>
      </div>
      {empty ? <p className="px-1 text-[13.5px] text-muted -mt-1">{quiet}</p> : children}
    </section>
  )
}

/** "⏱️ Até 1h por dia" + gentle warning on days where planned tasks pass the cap. */
export function TimeCapNote({ project, today }: { project: Project; today: DateKey }) {
  const db = useDB()
  const cap = useMemo(() => projectTimeCap(db, project.id), [db, project.id])
  const over = useMemo(() => capOverloads(db, project.id, today), [db, project.id, today])
  if (!cap) return null
  return (
    <div className="card p-4 flex gap-3 items-start">
      <span className="text-[20px] leading-none mt-0.5" aria-hidden>
        ⏱️
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium leading-snug">Até {minutesLabel(cap.limit)} por dia</div>
        {cap.notes && <div className="text-[13px] text-muted leading-snug mt-0.5">{cap.notes}</div>}
        {over.map((o) => (
          <div key={o.date} className="mt-2 rounded-xl bg-sand-soft text-ink-2 px-3 py-2 text-[13px] leading-snug">
            ⚠️ {relativeDay(o.date, today)}: {minutesLabel(o.minutes)} planejadas — o combinado é até {minutesLabel(o.limit)}. Que tal espalhar?
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProjectHome({ project, today, onTab }: { project: Project; today: DateKey; onTab: (t: ProjectTab) => void }) {
  const nav = useNavigate()
  const db = useDB()
  const todayTasks = useMemo(() => projectTodayTasks(db, project.id, today), [db, project.id, today])
  const week = useMemo(() => projectWeek(db, project.id, today), [db, project.id, today])
  const waiting = useMemo(() => waitingWork(db, project.id), [db, project.id])
  const meetings = useMemo(
    () =>
      db.meetings
        .filter((m) => m.projectId === project.id)
        .sort((a, b) => b.date.localeCompare(a.date) || (b.startTime ?? '').localeCompare(a.startTime ?? ''))
        .slice(0, 2),
    [db.meetings, project.id],
  )
  const wins = useMemo(() => winsSorted(db.wins.filter((w) => w.projectId === project.id)).slice(0, 2), [db.wins, project.id])
  const decisions = sortedLog(project.decisions).slice(0, 2)
  const roadmap = useMemo(() => {
    const list = db.milestones.filter((m) => m.projectId === project.id)
    return { total: list.length, counts: roadmapCounts(list) }
  }, [db.milestones, project.id])
  const delivery = project.nextDelivery
  const weekEmpty = week.dated.length === 0 && week.tasks.length === 0
  const openCount = useMemo(
    () => db.tasks.filter((t) => t.projectId === project.id && t.status !== 'waiting' && t.status !== 'done' && t.status !== 'archived' && !t.recurrence).length,
    [db.tasks, project.id],
  )
  const taskDefaults = { projectId: project.id, context: 'trabalho' as const, area: 'profissional' as const }

  return (
    <div>
      <div className="space-y-3">
        {project.description && <p className="text-[14.5px] text-ink-2 leading-relaxed px-1">{project.description}</p>}
        <TimeCapNote project={project} today={today} />
        <div className="card p-4 bg-accent-soft/40">
          <div className="eyebrow flex items-center gap-1.5 text-accent">
            <ArrowRight size={13} /> Próxima ação
          </div>
          <InlineEdit
            label="próxima ação"
            value={project.nextAction}
            placeholder="Qual é o próximo passo concreto?"
            className="font-display text-[19px] leading-snug"
            onSave={(v) => updateProject(project.id, { nextAction: v })}
          />
        </div>
        {roadmap.total > 0 && (
          <button type="button" onClick={() => onTab('roadmap')} className="card w-full p-4 flex items-center gap-3 text-left active:scale-[0.99] transition">
            <span className="h-10 w-10 rounded-full bg-plum-soft text-plum inline-flex items-center justify-center shrink-0">
              <MapIcon size={18} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-medium">Roadmap</span>
              <span className="block text-[13px] text-muted truncate">
                {[
                  roadmap.counts.em_andamento ? `${roadmap.counts.em_andamento} em andamento` : undefined,
                  roadmap.counts.roadmap ? `${roadmap.counts.roadmap} no roadmap` : undefined,
                  roadmap.counts.feito ? `${roadmap.counts.feito} ${roadmap.counts.feito === 1 ? 'feito' : 'feitos'}` : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <ArrowRight size={16} className="text-muted" />
          </button>
        )}
        {project.kind === 'creator' && (
          <button
            type="button"
            onClick={() => nav(`${ROUTES.creator}?tab=ideias&serie=${encodeURIComponent(project.id)}`)}
            className="card w-full p-4 flex items-center gap-3 text-left active:scale-[0.99] transition"
          >
            <span className="h-10 w-10 rounded-full bg-plum-soft text-plum inline-flex items-center justify-center shrink-0">
              <Clapperboard size={18} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-medium">Abrir Creator OS</span>
              <span className="block text-[13px] text-muted">ideias, conteúdo e parcerias</span>
            </span>
            <ArrowRight size={16} className="text-muted" />
          </button>
        )}
      </div>

      <HomeSection
        title="Hoje"
        quiet="Nada pra hoje aqui."
        empty={todayTasks.length === 0}
        addLabel="Nova tarefa pra hoje"
        onAdd={() => openSheet('task', { defaults: { ...taskDefaults, date: today } })}
      >
        <ListCard>
          <CappedList items={todayTasks} render={(t) => <WorkTaskRow key={t.id} task={t} today={today} showProject={false} />} className="divide-y divide-line/70" />
        </ListCard>
      </HomeSection>

      <HomeSection
        title="Esta semana"
        quiet={openCount ? `Nada com data esta semana · ${pluralize(openCount, 'tarefa aberta', 'tarefas abertas')} quando der.` : 'Semana leve por aqui.'}
        empty={weekEmpty}
        addLabel="Nova tarefa da semana"
        onAdd={() => openSheet('task', { defaults: { ...taskDefaults, bucket: 'semana' } })}
        onMore={() => onTab('tarefas')}
        alwaysMore={openCount > 0}
      >
        <ListCard>
          <div className="divide-y divide-line/70">
            {week.dated.map((i) => (
              <DatedRow key={i.key} item={i} today={today} showProject={false} />
            ))}
            {week.tasks.slice(0, 4).map((t) => (
              <WorkTaskRow key={t.id} task={t} today={today} showProject={false} />
            ))}
          </div>
        </ListCard>
      </HomeSection>

      <HomeSection
        title="Waiting For"
        quiet="Ninguém te devendo nada."
        empty={waiting.length === 0}
        addLabel="Adicionar Waiting For"
        onAdd={() => openSheet('task', { defaults: { ...taskDefaults, status: 'waiting', waiting: { who: '', since: today } } })}
        onMore={waiting.length > 3 ? () => onTab('waiting') : undefined}
      >
        <ListCard>
          <div className="divide-y divide-line/70">
            {waiting.slice(0, 3).map((t) => (
              <WaitingRow key={t.id} task={t} today={today} showProject={false} />
            ))}
          </div>
        </ListCard>
      </HomeSection>

      <HomeSection
        title="Reuniões"
        quiet="Nenhuma reunião registrada."
        empty={meetings.length === 0}
        addLabel="Registrar reunião"
        onAdd={() => openSheet('meeting', { projectId: project.id })}
        onMore={() => onTab('reunioes')}
      >
        <ListCard>
          {meetings.map((m) => (
            <button key={m.id} type="button" onClick={() => openSheet('meeting', { id: m.id })} className="w-full text-left px-4 py-3 min-h-[52px] active:bg-surface-2">
              <div className="text-[15px] leading-snug">{m.title}</div>
              <div className="text-[12.5px] text-muted mt-0.5">
                {[relativeDay(m.date, today), m.startTime, m.decisions.length ? pluralize(m.decisions.length, 'decisão', 'decisões') : undefined].filter(Boolean).join(' · ')}
              </div>
            </button>
          ))}
        </ListCard>
      </HomeSection>

      <HomeSection
        title="Decisões"
        quiet="Nenhuma decisão registrada ainda."
        empty={decisions.length === 0}
        addLabel="Registrar decisão"
        onAdd={() => onTab('decisoes')}
        onMore={() => onTab('decisoes')}
      >
        <ListCard>
          {decisions.map(({ entry, index }) => (
            <div key={index} className="px-4 py-3">
              <div className="text-[12px] text-muted">{formatShortDate(entry.date)}</div>
              <div className="text-[15px] leading-snug">{entry.text}</div>
            </div>
          ))}
        </ListCard>
      </HomeSection>

      <HomeSection
        title="Wins"
        quiet="Entregou, fechou, recebeu um elogio? Registra ✨"
        empty={wins.length === 0}
        addLabel="Registrar win"
        onAdd={() => openSheet('win', { projectId: project.id })}
        onMore={() => onTab('wins')}
      >
        <ListCard>
          {wins.map((w) => (
            <button key={w.id} type="button" onClick={() => openSheet('win', { id: w.id })} className="w-full text-left flex items-center gap-3 px-4 py-3 min-h-[52px] active:bg-surface-2">
              <span className="text-[18px]" aria-hidden>
                {winKind(w.kind).emoji}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] leading-snug">{w.title}</span>
                <span className="block text-[12.5px] text-muted">{formatShortDate(w.date)}</span>
              </span>
            </button>
          ))}
        </ListCard>
      </HomeSection>

      <section className="mt-6" aria-label="Detalhes">
        <h2 className="eyebrow px-1 mb-2">Detalhes</h2>
        <ListCard>
          <Block label="Próxima entrega">
            <InlineEdit
              label="próxima entrega"
              value={delivery?.title}
              placeholder="Ainda não definida"
              onSave={(v) => updateProject(project.id, { nextDelivery: v ? { title: v, date: delivery?.date } : undefined })}
            />
            {delivery?.title && (
              <div className="flex items-center gap-2 mt-1">
                <DateInput
                  aria-label="Data da próxima entrega"
                  className="flex-1"
                  value={delivery.date}
                  onChange={(v) => updateProject(project.id, { nextDelivery: { title: delivery.title, date: v } })}
                />
                {delivery.date && <Tag className="shrink-0">{dueLabel(delivery.date, today)}</Tag>}
              </div>
            )}
          </Block>
          <Block label="Deadline">
            <div className="flex items-center gap-2 mt-1">
              <DateInput aria-label="Deadline" className="flex-1" value={project.deadline} onChange={(v) => updateProject(project.id, { deadline: v })} />
              {project.deadline && <Tag className="shrink-0">{dueLabel(project.deadline, today)}</Tag>}
            </div>
          </Block>
          <Block label="Descrição">
            <InlineEdit label="descrição" multiline value={project.description} placeholder="Em uma frase, o que é esse projeto" onSave={(v) => updateProject(project.id, { description: v })} />
          </Block>
          <Block label="Objetivo">
            <InlineEdit label="objetivo" multiline value={project.objective} placeholder="O que seria sucesso aqui?" onSave={(v) => updateProject(project.id, { objective: v })} />
          </Block>
        </ListCard>
      </section>
    </div>
  )
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="eyebrow mb-0.5">{label}</div>
      {children}
    </div>
  )
}
