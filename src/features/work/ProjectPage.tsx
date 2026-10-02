import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Clapperboard, ExternalLink, Pencil, Plus, X } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { DateKey, Link as LinkT, LogEntry, Person, Project, ProjectMilestone } from '@/data/types'
import { isTaskOpen } from '@/data/selectors'
import { useToday } from '@/hooks/useToday'
import { cn } from '@/lib/cn'
import { formatShortDate, relativeDay } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { Button, Checkbox, DateInput, EmptyState, IconButton, ListCard, Page, PageHeader, Segmented } from '@/components/ui'
import { PRIORITY, winKind } from './constants'
import { AddLine, InlineEdit, PriorityDot, ProjectEmoji, Reveal, StatusPill, Tag } from './components'
import { updateProject } from './mutations'
import { dueLabel, projectLastUpdate, sortedLog, updatedAgoLabel, waitingWork, winsSorted } from './selectors'
import { WaitingRow } from './WaitingRow'
import { WorkTaskRow } from './WorkTaskRow'

type Tab = 'geral' | 'tarefas' | 'milestones' | 'waiting' | 'pessoas' | 'links' | 'notas' | 'decisoes' | 'changelog' | 'reunioes' | 'wins'

const TABS: { value: Tab; label: string }[] = [
  { value: 'geral', label: 'Visão geral' },
  { value: 'tarefas', label: 'Tarefas' },
  { value: 'milestones', label: 'Milestones' },
  { value: 'waiting', label: 'Waiting For' },
  { value: 'reunioes', label: 'Reuniões' },
  { value: 'pessoas', label: 'Pessoas' },
  { value: 'links', label: 'Links & arquivos' },
  { value: 'notas', label: 'Notas' },
  { value: 'decisoes', label: 'Decisões' },
  { value: 'changelog', label: 'Changelog' },
  { value: 'wins', label: 'Wins' },
]

export default function ProjectPage() {
  const { id = '' } = useParams()
  const db = useDB()
  const today = useToday()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'geral') as Tab
  const setTab = (t: Tab) => setParams(t === 'geral' ? {} : { tab: t }, { replace: true })
  const project = db.projects.find((p) => p.id === id)
  const lastUpdate = useMemo(() => projectLastUpdate(db, id), [db, id])
  const tabsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Keep the active tab visible in the horizontally scrolling tab bar.
    const el = tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [tab])

  if (!project)
    return (
      <Page>
        <PageHeader back backTo={ROUTES.work} title="Projeto" />
        <EmptyState emoji="🍃" title="Esse projeto não está mais aqui" text="Talvez tenha sido apagado." action={<Button onClick={() => nav(ROUTES.work)}>Voltar ao trabalho</Button>} />
      </Page>
    )

  return (
    <Page>
      <PageHeader
        back
        backTo={ROUTES.work}
        title={
          <span className="flex items-center gap-3">
            <ProjectEmoji project={project} size="md" />
            <span className="min-w-0">{project.name}</span>
          </span>
        }
        subtitle={project.role}
        actions={
          <IconButton label="Editar projeto" onClick={() => openSheet('project', { id: project.id })}>
            <Pencil size={19} />
          </IconButton>
        }
      />
      <Reveal className="-mt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => openSheet('project', { id: project.id })} aria-label="Mudar status">
            <StatusPill status={project.status} />
          </button>
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
            <PriorityDot priority={project.priority} />
            {PRIORITY[project.priority].label}
          </span>
          <span className="text-[12.5px] text-muted">· {updatedAgoLabel(lastUpdate, today)}</span>
        </div>
      </Reveal>

      <div ref={tabsRef}>
        <Segmented variant="tabs" className="mt-5 -mx-4 px-4" value={tab} onChange={setTab} options={TABS} />
      </div>

      <div className="mt-4">
        {tab === 'geral' && <Overview project={project} today={today} onTab={setTab} />}
        {tab === 'tarefas' && <TasksTab project={project} today={today} />}
        {tab === 'milestones' && <MilestonesTab project={project} today={today} />}
        {tab === 'waiting' && <WaitingTab project={project} today={today} />}
        {tab === 'pessoas' && <PeopleTab project={project} />}
        {tab === 'links' && <LinksTab project={project} />}
        {tab === 'notas' && <NotesTab project={project} />}
        {tab === 'decisoes' && <LogTab project={project} field="decisions" placeholder="Nova decisão" empty="Decisões importantes ficam aqui, com data." today={today} />}
        {tab === 'changelog' && <LogTab project={project} field="changelog" placeholder="O que mudou?" empty="Mudanças de status, prioridade e deadline entram aqui sozinhas." today={today} />}
        {tab === 'reunioes' && <MeetingsTab project={project} today={today} />}
        {tab === 'wins' && <WinsTab project={project} />}
      </div>
    </Page>
  )
}

// ─── Building blocks ────────────────────────────────────────────────────────

function Block({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('px-4 py-3', className)}>
      <div className="eyebrow mb-0.5">{label}</div>
      {children}
    </div>
  )
}

function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button variant="soft" size="md" block icon={<Plus size={16} />} onClick={onClick} className="mt-3">
      {children}
    </Button>
  )
}

/** Remove one entry from an array field with "Desfazer". */
function removeAt<K extends 'people' | 'links' | 'files' | 'decisions' | 'changelog'>(project: Project, field: K, index: number, msg: string) {
  const prev = project[field]
  actions.update('projects', project.id, { [field]: prev.filter((_, i) => i !== index) } as Partial<Project>)
  toast(msg, { action: { label: 'Desfazer', run: () => actions.update('projects', project.id, { [field]: prev } as Partial<Project>) } })
}

// ─── Visão geral ────────────────────────────────────────────────────────────

function Overview({ project, today, onTab }: { project: Project; today: DateKey; onTab: (t: Tab) => void }) {
  const nav = useNavigate()
  const db = useDB()
  const counts = useMemo(() => {
    const tasks = db.tasks.filter((t) => t.projectId === project.id)
    return {
      open: tasks.filter((t) => isTaskOpen(t) && t.status !== 'waiting').length,
      waiting: tasks.filter((t) => t.status === 'waiting').length,
      milestone: db.milestones
        .filter((m) => m.projectId === project.id && !m.done)
        .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.order - b.order)[0],
    }
  }, [db, project.id])
  const delivery = project.nextDelivery

  return (
    <div className="space-y-3">
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

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="abertas" value={counts.open} onClick={() => onTab('tarefas')} />
        <Stat label="esperando" value={counts.waiting} onClick={() => onTab('waiting')} />
        <Stat
          label={counts.milestone ? (counts.milestone.date ? relativeDay(counts.milestone.date, today) : 'sem data') : 'milestones'}
          value={counts.milestone ? '◆' : '–'}
          hint={counts.milestone?.title}
          onClick={() => onTab('milestones')}
        />
      </div>

      {project.kind === 'creator' && (
        <button type="button" onClick={() => nav(ROUTES.creator)} className="card w-full p-4 flex items-center gap-3 text-left active:scale-[0.99] transition">
          <span className="h-10 w-10 rounded-full bg-plum-soft text-plum inline-flex items-center justify-center">
            <Clapperboard size={18} />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-medium">Abrir Creator OS</span>
            <span className="block text-[13px] text-muted">pipeline de conteúdo e parcerias</span>
          </span>
          <ArrowRight size={16} className="text-muted" />
        </button>
      )}
    </div>
  )
}

function Stat({ label, value, hint, onClick }: { label: string; value: ReactNode; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card p-3 text-left active:scale-[0.98] transition min-w-0">
      <div className="font-display text-[24px] leading-none">{value}</div>
      <div className="text-[12px] text-muted mt-1.5 truncate">{label}</div>
      {hint && <div className="text-[12px] text-ink-2 truncate">{hint}</div>}
    </button>
  )
}

// ─── Tarefas ────────────────────────────────────────────────────────────────

function TasksTab({ project, today }: { project: Project; today: DateKey }) {
  const db = useDB()
  const [showDone, setShowDone] = useState(false)
  const { open, done } = useMemo(() => {
    const all = db.tasks.filter((t) => t.projectId === project.id && t.status !== 'waiting' && t.status !== 'archived').sort((a, b) => a.order - b.order)
    return { open: all.filter((t) => t.status !== 'done'), done: all.filter((t) => t.status === 'done') }
  }, [db.tasks, project.id])
  return (
    <div>
      {open.length === 0 ? (
        <div className="card">
          <EmptyState compact emoji="🌿" title="Nada aberto aqui" text="Quando surgir algo, joga aqui." />
        </div>
      ) : (
        <ListCard>
          {open.map((t) => (
            <WorkTaskRow key={t.id} task={t} today={today} showProject={false} />
          ))}
        </ListCard>
      )}
      <AddButton onClick={() => openSheet('task', { defaults: { projectId: project.id, context: 'trabalho', area: 'profissional' } })}>Nova tarefa</AddButton>
      {done.length > 0 && (
        <div className="mt-3">
          <button type="button" className="w-full h-11 text-[13px] text-muted" onClick={() => setShowDone((s) => !s)}>
            {showDone ? 'esconder concluídas' : `concluídas (${done.length})`}
          </button>
          {showDone && (
            <ListCard>
              {done.map((t) => (
                <WorkTaskRow key={t.id} task={t} today={today} showProject={false} />
              ))}
            </ListCard>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Milestones ─────────────────────────────────────────────────────────────

function MilestonesTab({ project, today }: { project: Project; today: DateKey }) {
  const milestones = useDB((db) => db.milestones)
  const list = useMemo(
    () =>
      milestones
        .filter((m) => m.projectId === project.id)
        .sort((a, b) => Number(a.done) - Number(b.done) || (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.order - b.order),
    [milestones, project.id],
  )
  return (
    <div>
      {list.length === 0 ? (
        <div className="card">
          <EmptyState compact emoji="◆" title="Sem milestones ainda" text="Marcos ajudam a enxergar o caminho — sem pressa." />
        </div>
      ) : (
        <ListCard>
          {list.map((m) => (
            <MilestoneRow key={m.id} m={m} today={today} />
          ))}
        </ListCard>
      )}
      <AddLine
        className="mt-3"
        placeholder="Novo milestone"
        onAdd={(title) => {
          actions.create('milestones', { projectId: project.id, title, done: false, order: nextOrder(getDB().milestones) })
          haptic('light')
        }}
      />
    </div>
  )
}

function MilestoneRow({ m, today }: { m: ProjectMilestone; today: DateKey }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <div className="pt-2.5">
        <Checkbox
          checked={m.done}
          label={`Concluir ${m.title}`}
          onChange={(done) => {
            actions.update('milestones', m.id, { done })
            if (done) {
              haptic('success')
              toast('Milestone alcançado ✨')
            }
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <InlineEdit label="milestone" value={m.title} placeholder="Milestone" className={cn('text-[15px]', m.done && 'text-muted line-through')} onSave={(v) => v && actions.update('milestones', m.id, { title: v })} />
        <div className="flex items-center gap-2">
          <DateInput aria-label="Data do milestone" className="!min-h-10 !py-1.5 text-[14px] flex-1" value={m.date} onChange={(v) => actions.update('milestones', m.id, { date: v })} />
          {m.date && !m.done && <Tag className="shrink-0">{dueLabel(m.date, today)}</Tag>}
        </div>
      </div>
      <IconButton label="Apagar milestone" size="sm" className="mt-1.5" onClick={() => removeWithUndo('milestones', m.id, 'Milestone apagado')}>
        <X size={16} />
      </IconButton>
    </div>
  )
}

// ─── Waiting ────────────────────────────────────────────────────────────────

function WaitingTab({ project, today }: { project: Project; today: DateKey }) {
  const db = useDB()
  const list = useMemo(() => waitingWork(db, project.id), [db, project.id])
  return (
    <div>
      {list.length === 0 ? (
        <div className="card">
          <EmptyState compact emoji="⏳" title="Ninguém te devendo nada" text="Quando depender de alguém, registra aqui pra não carregar na cabeça." />
        </div>
      ) : (
        <ListCard>
          {list.map((t) => (
            <WaitingRow key={t.id} task={t} today={today} showProject={false} />
          ))}
        </ListCard>
      )}
      <AddButton onClick={() => openSheet('task', { defaults: { projectId: project.id, context: 'trabalho', area: 'profissional', status: 'waiting', waiting: { who: '', since: today } } })}>
        Adicionar Waiting For
      </AddButton>
    </div>
  )
}

// ─── Pessoas ────────────────────────────────────────────────────────────────

function PeopleTab({ project }: { project: Project }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [contact, setContact] = useState('')
  const add = () => {
    if (!name.trim()) return
    const person: Person = { name: name.trim(), role: role.trim() || undefined, contact: contact.trim() || undefined }
    actions.update('projects', project.id, { people: [...project.people, person] })
    setName('')
    setRole('')
    setContact('')
  }
  return (
    <div>
      {project.people.length === 0 ? (
        <div className="card">
          <EmptyState compact emoji="🤝" title="Quem está nesse projeto?" text="Stakeholders, time, contatos-chave." />
        </div>
      ) : (
        <ListCard>
          {project.people.map((p, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 min-h-[56px]">
              <span className="h-9 w-9 rounded-full bg-surface-2 inline-flex items-center justify-center text-[14px] font-semibold text-ink-2 shrink-0">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] truncate">{p.name}</div>
                {(p.role || p.contact) && <div className="text-[12.5px] text-muted truncate">{[p.role, p.contact].filter(Boolean).join(' · ')}</div>}
              </div>
              <IconButton label={`Remover ${p.name}`} size="sm" onClick={() => removeAt(project, 'people', i, 'Pessoa removida')}>
                <X size={16} />
              </IconButton>
            </div>
          ))}
        </ListCard>
      )}
      <form
        className="card p-4 mt-3 space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input className="input" placeholder="Nome" aria-label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-2.5">
          <input className="input" placeholder="Papel" aria-label="Papel" value={role} onChange={(e) => setRole(e.target.value)} />
          <input className="input" placeholder="Contato" aria-label="Contato" value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <Button type="submit" variant="primary" size="md" block disabled={!name.trim()}>
          Adicionar pessoa
        </Button>
      </form>
    </div>
  )
}

// ─── Links & arquivos ───────────────────────────────────────────────────────

function normalizeUrl(u: string): string {
  const v = u.trim()
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
}

function LinksTab({ project }: { project: Project }) {
  return (
    <div className="space-y-6">
      <LinkSection project={project} field="links" title="Links" empty="Docs, boards, dashboards." />
      <LinkSection project={project} field="files" title="Arquivos" empty="Contratos, decks, PDFs (o link de onde estão)." />
    </div>
  )
}

function LinkSection({ project, field, title, empty }: { project: Project; field: 'links' | 'files'; title: string; empty: string }) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const list: LinkT[] = project[field]
  return (
    <div>
      <div className="eyebrow px-1 mb-2">{title}</div>
      {list.length === 0 ? (
        <p className="text-[13.5px] text-muted px-1 mb-2">{empty}</p>
      ) : (
        <ListCard className="mb-2.5">
          {list.map((l, i) => (
            <div key={i} className="flex items-center gap-1 pr-2">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 flex items-center gap-3 px-4 py-2.5 min-h-[52px] active:bg-surface-2">
                <ExternalLink size={15} className="text-muted shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[15px] truncate">{l.label || l.url}</span>
                  {l.label && <span className="block text-[12px] text-muted truncate">{l.url.replace(/^https?:\/\//, '')}</span>}
                </span>
              </a>
              <IconButton label={`Remover ${l.label || l.url}`} size="sm" onClick={() => removeAt(project, field, i, 'Removido')}>
                <X size={16} />
              </IconButton>
            </div>
          ))}
        </ListCard>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!url.trim()) return
          const link: LinkT = { label: label.trim(), url: normalizeUrl(url) }
          actions.update('projects', project.id, { [field]: [...list, link] } as Partial<Project>)
          setLabel('')
          setUrl('')
        }}
      >
        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
          <input className="input" placeholder="Nome" aria-label={`Nome do ${title}`} value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="input" placeholder="https://" inputMode="url" aria-label="URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <Button type="submit" variant="soft" size="md" disabled={!url.trim()} icon={<Plus size={15} />}>
          Adicionar
        </Button>
      </form>
    </div>
  )
}

// ─── Notas ──────────────────────────────────────────────────────────────────

function NotesTab({ project }: { project: Project }) {
  const [text, setText] = useState(project.notes ?? '')
  const save = () => {
    if ((project.notes ?? '') !== text) {
      actions.update('projects', project.id, { notes: text || undefined })
      toast('Notas salvas')
    }
  }
  return (
    <div>
      <textarea
        className="input resize-none leading-relaxed min-h-[260px]"
        placeholder="Contexto, ideias, o que não pode esquecer…"
        aria-label="Notas do projeto"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
      <p className="text-[12px] text-muted mt-1.5 px-1">Salva sozinho quando você sai do campo.</p>
    </div>
  )
}

// ─── Decisões / Changelog ───────────────────────────────────────────────────

function LogTab({
  project,
  field,
  placeholder,
  empty,
  today,
}: {
  project: Project
  field: 'decisions' | 'changelog'
  placeholder: string
  empty: string
  today: DateKey
}) {
  const log: LogEntry[] = project[field]
  const sorted = sortedLog(log)
  return (
    <div>
      <AddLine
        className="mb-3"
        placeholder={placeholder}
        onAdd={(text) => actions.update('projects', project.id, { [field]: [...log, { date: today, text }] } as Partial<Project>)}
      />
      {sorted.length === 0 ? (
        <div className="card">
          <EmptyState compact emoji={field === 'decisions' ? '🧭' : '🗒️'} title="Nada registrado ainda" text={empty} />
        </div>
      ) : (
        <div className="relative pl-5">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-line" aria-hidden />
          {sorted.map(({ entry, index }) => (
            <div key={index} className="relative flex items-start gap-2 py-2">
              <span className="absolute -left-5 top-[15px] h-[9px] w-[9px] rounded-full bg-surface border-2 border-muted/60" aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-muted">{formatShortDate(entry.date)}</div>
                <div className="text-[15px] leading-snug">{entry.text}</div>
              </div>
              <IconButton label="Remover" size="sm" onClick={() => removeAt(project, field, index, 'Removido')}>
                <X size={15} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Reuniões ───────────────────────────────────────────────────────────────

function MeetingsTab({ project, today }: { project: Project; today: DateKey }) {
  const meetings = useDB((db) => db.meetings)
  const list = useMemo(
    () => meetings.filter((m) => m.projectId === project.id).sort((a, b) => b.date.localeCompare(a.date) || (b.startTime ?? '').localeCompare(a.startTime ?? '')),
    [meetings, project.id],
  )
  return (
    <div>
      {list.length === 0 ? (
        <div className="card">
          <EmptyState compact emoji="📝" title="Nenhuma reunião registrada" text="Notas, decisões e próximos passos — tudo num lugar." />
        </div>
      ) : (
        <ListCard>
          {list.map((m) => (
            <button key={m.id} type="button" onClick={() => openSheet('meeting', { id: m.id })} className="w-full text-left px-4 py-3 min-h-[56px] active:bg-surface-2">
              <div className="text-[15px]">{m.title}</div>
              <div className="text-[12.5px] text-muted mt-0.5">
                {[relativeDay(m.date, today), m.startTime, m.decisions.length ? `${m.decisions.length} decis${m.decisions.length === 1 ? 'ão' : 'ões'}` : undefined, m.actionItems.length ? `${m.actionItems.length} próximos passos` : undefined]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </button>
          ))}
        </ListCard>
      )}
      <AddButton onClick={() => openSheet('meeting', { projectId: project.id })}>Registrar reunião</AddButton>
    </div>
  )
}

// ─── Wins ───────────────────────────────────────────────────────────────────

function WinsTab({ project }: { project: Project }) {
  const wins = useDB((db) => db.wins)
  const list = useMemo(() => winsSorted(wins.filter((w) => w.projectId === project.id)), [wins, project.id])
  return (
    <div>
      {list.length === 0 ? (
        <div className="card">
          <EmptyState compact emoji="✨" title="Os wins desse projeto moram aqui" text="Entregou, fechou, recebeu um elogio? Registra." />
        </div>
      ) : (
        <ListCard>
          {list.map((w) => (
            <button key={w.id} type="button" onClick={() => openSheet('win', { id: w.id })} className="w-full text-left flex items-center gap-3 px-4 py-3 min-h-[56px] active:bg-surface-2">
              <span className="text-[19px]" aria-hidden>
                {winKind(w.kind).emoji}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] leading-snug">{w.title}</span>
                <span className="block text-[12.5px] text-muted">
                  {winKind(w.kind).label} · {formatShortDate(w.date)}
                </span>
              </span>
            </button>
          ))}
        </ListCard>
      )}
      <AddButton onClick={() => openSheet('win', { projectId: project.id })}>Registrar win ✨</AddButton>
    </div>
  )
}
