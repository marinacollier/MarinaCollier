import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Lock, Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { useDB } from '@/data/store'
import type { DateKey, Project, WorkInboxItem } from '@/data/types'
import { useToday } from '@/hooks/useToday'
import { cn } from '@/lib/cn'
import { relativeDay } from '@/lib/date'
import { pluralize } from '@/lib/text'
import { Button, DateInput, EmptyState, IconButton, Page, PageHeader, SectionTitle, Select } from '@/components/ui'
import { CALM_EMPTY, inboxKindLabel, INBOX_SOURCES, PRIVACY_NOTE } from './constants'
import { Reveal, Tag } from './components'
import { convertInboxItem, patchInboxItem, setInboxStatus } from './mutations'
import { inboxHandled, inboxNew, integrationConnected, projectById, receivedLabel } from './selectors'

const HANDLED_LABEL: Record<WorkInboxItem['status'], string> = {
  novo: 'novo',
  virou_tarefa: 'virou tarefa',
  waiting: 'no waiting for',
  resolvido: 'resolvido',
  ignorado: 'ignorado',
}

export default function WorkInboxPage() {
  const db = useDB()
  const today = useToday()
  const [showHandled, setShowHandled] = useState(false)
  const items = useMemo(() => inboxNew(db), [db])
  const handled = useMemo(() => inboxHandled(db), [db])
  const outlook = integrationConnected(db, 'outlook')
  const teams = integrationConnected(db, 'teams')

  return (
    <Page>
      <PageHeader
        back
        backTo={ROUTES.work}
        eyebrow="Trabalho"
        title="Work Inbox"
        subtitle={items.length ? `${pluralize(items.length, 'item', 'itens')} para decidir — você escolhe o destino` : 'Possíveis ações de e-mail, Teams e notas'}
        actions={
          <IconButton label="Adicionar item" onClick={() => openSheet('workInboxItem')}>
            <Plus size={22} />
          </IconButton>
        }
      />

      {!(outlook && teams) && (
        <Reveal>
          <div className="rounded-[var(--radius-card)] bg-surface-2 px-4 py-3.5 text-[14px] text-ink-2">
            <div>
              {!outlook && !teams
                ? 'Outlook e Teams ainda não estão conectados.'
                : `${outlook ? 'Teams' : 'Outlook'} ainda não está conectado.`}{' '}
              Você pode adicionar itens manualmente.
            </div>
            <Link to={ROUTES.integrations} className="inline-flex items-center gap-1 mt-1.5 h-9 text-[13.5px] font-medium text-accent">
              Ver integrações <ArrowRight size={14} />
            </Link>
          </div>
        </Reveal>
      )}

      <SectionTitle>Para decidir</SectionTitle>
      {items.length === 0 ? (
        <div className="card">
          <EmptyState
            emoji="☕"
            title="Inbox zerado"
            text={CALM_EMPTY}
            action={
              <Button variant="soft" size="sm" icon={<Plus size={15} />} onClick={() => openSheet('workInboxItem')}>
                Adicionar item
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it, i) => (
            <Reveal key={it.id} delay={Math.min(i, 6) * 0.03}>
              <InboxCard item={it} today={today} projects={db.projects} project={projectById(db, it.projectId)} />
            </Reveal>
          ))}
        </div>
      )}

      {handled.length > 0 && (
        <div className="mt-6">
          <button type="button" onClick={() => setShowHandled((s) => !s)} className="w-full h-11 text-[13px] text-muted" aria-expanded={showHandled}>
            {showHandled ? 'esconder já decididos' : `já decididos (${handled.length})`}
          </button>
          {showHandled && (
            <div className="card overflow-hidden divide-y divide-line/70">
              {handled.map((it) => (
                <div key={it.id} className="flex items-center gap-3 px-4 py-2.5 min-h-[52px]">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] truncate text-ink-2">{it.subject}</div>
                    <div className="text-[12.5px] text-muted">{HANDLED_LABEL[it.status]}</div>
                  </div>
                  {(it.status === 'resolvido' || it.status === 'ignorado') && (
                    <button type="button" className="h-9 px-3 rounded-full text-[12.5px] text-ink-2 bg-surface-2" onClick={() => setInboxStatus(it, 'novo')}>
                      voltar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="flex items-start gap-2 text-[12.5px] text-muted mt-8 px-1">
        <Lock size={13} className="mt-[2px] shrink-0" />
        <span>{PRIVACY_NOTE} Nada vira tarefa sozinho: você decide cada item.</span>
      </p>
    </Page>
  )
}

function InboxCard({ item, today, projects, project }: { item: WorkInboxItem; today: DateKey; projects: Project[]; project?: Project }) {
  const [panel, setPanel] = useState<'none' | 'deadline' | 'project'>('none')
  const meta = [item.sender, receivedLabel(item.receivedAt, today)].filter(Boolean).join(' · ')
  return (
    <div className="card p-4">
      <button type="button" className="w-full text-left" onClick={() => openSheet('workInboxItem', { id: item.id })}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tag className={INBOX_SOURCES[item.source].cls}>{INBOX_SOURCES[item.source].label}</Tag>
          <Tag>{inboxKindLabel(item.kind)}</Tag>
          {meta && <span className="text-[12.5px] text-muted truncate">{meta}</span>}
        </div>
        <div className="font-display text-[18px] leading-snug mt-2">{item.subject}</div>
        {item.summary && <div className="text-[13.5px] text-ink-2 mt-1">{item.summary}</div>}
        {(project || item.dueDate) && (
          <div className="text-[12.5px] text-muted mt-1.5">
            {[project ? `${project.emoji} ${project.name}` : undefined, item.dueDate ? `deadline ${relativeDay(item.dueDate, today)}` : undefined]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
      </button>

      <div className="grid grid-cols-2 gap-2 mt-3.5">
        <Button variant="primary" size="sm" onClick={() => convertInboxItem(item, 'task')}>
          Virar tarefa ✓
        </Button>
        <Button variant="soft" size="sm" onClick={() => convertInboxItem(item, 'waiting')}>
          Waiting For ⏳
        </Button>
      </div>
      <div className="flex justify-between mt-1.5 -mx-1">
        <SmallAction active={panel === 'deadline'} onClick={() => setPanel(panel === 'deadline' ? 'none' : 'deadline')}>
          {item.dueDate ? 'deadline' : '+ deadline'}
        </SmallAction>
        <SmallAction active={panel === 'project'} onClick={() => setPanel(panel === 'project' ? 'none' : 'project')}>
          {item.projectId ? 'projeto' : '+ projeto'}
        </SmallAction>
        <SmallAction onClick={() => setInboxStatus(item, 'resolvido')}>resolvido</SmallAction>
        <SmallAction onClick={() => setInboxStatus(item, 'ignorado')}>ignorar</SmallAction>
      </div>
      {panel === 'deadline' && (
        <div className="mt-2">
          <DateInput
            aria-label="Deadline"
            value={item.dueDate}
            onChange={(v) => {
              patchInboxItem(item, { dueDate: v })
              setPanel('none')
            }}
          />
        </div>
      )}
      {panel === 'project' && (
        <div className="mt-2">
          <Select
            value={item.projectId}
            placeholder="Sem projeto"
            onChange={(v) => {
              patchInboxItem(item, { projectId: v })
              setPanel('none')
            }}
            options={projects.map((p) => ({ value: p.id, label: `${p.emoji} ${p.name}` }))}
          />
        </div>
      )}
    </div>
  )
}

function SmallAction({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('h-10 px-2 rounded-full text-[13px] whitespace-nowrap transition-colors', active ? 'text-ink font-medium bg-surface-2' : 'text-muted active:text-ink')}
    >
      {children}
    </button>
  )
}
