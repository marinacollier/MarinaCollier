import { useMemo, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { Project, ProjectMilestone } from '@/data/types'
import { Button, ChipSelect, DateInput, EmptyState, IconButton, ListCard } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatShortDate } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { AddLine, InlineEdit, Tag } from './components'
import { groupRoadmap, milestoneStatus, nextRoadmapStatus, roadmapCounts, roadmapGroups, ROADMAP_STATUS, statusPatch } from './roadmap'

export function RoadmapTab({ project }: { project: Project }) {
  const milestones = useDB((db) => db.milestones)
  const list = useMemo(() => milestones.filter((m) => m.projectId === project.id), [milestones, project.id])
  const lanes = useMemo(() => groupRoadmap(list), [list])
  const groups = useMemo(() => roadmapGroups(list), [list])
  const counts = useMemo(() => roadmapCounts(list), [list])
  const [target, setTarget] = useState<string | undefined>(undefined)
  const [newGroup, setNewGroup] = useState('')

  const add = (title: string) => {
    const group = newGroup.trim() || target
    actions.create('milestones', { projectId: project.id, title, group, status: 'roadmap', done: false, order: nextOrder(getDB().milestones) })
    if (newGroup.trim()) {
      setTarget(newGroup.trim())
      setNewGroup('')
    }
    haptic('light')
  }

  return (
    <div>
      {list.length === 0 ? (
        <div className="card">
          <EmptyState compact emoji="🗺️" title="Roadmap em branco" text="Anota os próximos passos por área — sem data obrigatória, sem pressa." />
        </div>
      ) : (
        <>
          <p className="text-[13px] text-muted px-1 mb-3">
            {[
              counts.em_andamento ? `${counts.em_andamento} em andamento` : undefined,
              counts.roadmap ? `${counts.roadmap} no roadmap` : undefined,
              counts.feito ? `${counts.feito} ${counts.feito === 1 ? 'feito' : 'feitos'}` : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
            <span className="opacity-80"> · toque no status pra mudar</span>
          </p>
          <div className="space-y-4">
            {lanes.map((lane) => (
              <section key={lane.group} aria-label={lane.group}>
                <div className="flex items-baseline gap-2 px-1 mb-1.5">
                  <h3 className="eyebrow">{lane.group}</h3>
                  {lane.items.length > 1 && <span className="text-[12px] text-muted">{lane.items.length}</span>}
                </div>
                <ListCard>
                  {lane.items.map((m) => (
                    <RoadmapRow key={m.id} m={m} groups={groups} />
                  ))}
                </ListCard>
              </section>
            ))}
          </div>
        </>
      )}

      <div className="card p-4 mt-4 space-y-3">
        <div className="eyebrow">Novo item</div>
        {groups.length > 0 && <ChipSelect clearable value={target} onChange={setTarget} options={groups.map((g) => ({ value: g, label: g }))} />}
        <input
          className="input"
          placeholder={groups.length ? 'ou um grupo novo (opcional)' : 'Grupo (opcional) — ex.: Produto'}
          aria-label="Grupo do item"
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
        />
        <AddLine placeholder={target && !newGroup.trim() ? `Novo item em ${target}` : 'Novo item do roadmap'} onAdd={add} />
      </div>
    </div>
  )
}

function RoadmapRow({ m, groups }: { m: ProjectMilestone; groups: string[] }) {
  const [open, setOpen] = useState(false)
  const status = milestoneStatus(m)
  const meta = ROADMAP_STATUS[status]
  const cycle = () => {
    const next = nextRoadmapStatus(status)
    actions.update('milestones', m.id, statusPatch(next))
    if (next === 'feito') {
      haptic('success')
      toast('Feito ✨', { action: { label: 'Desfazer', run: () => actions.update('milestones', m.id, statusPatch(status)) } })
    } else haptic('light')
  }
  return (
    <div className="px-4 py-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <InlineEdit
            label="item do roadmap"
            value={m.title}
            placeholder="Item"
            className={cn('text-[15px]', status === 'feito' && 'text-muted')}
            onSave={(v) => v && actions.update('milestones', m.id, { title: v })}
          />
        </div>
        {m.date && <Tag className="shrink-0">{formatShortDate(m.date)}</Tag>}
        <button
          type="button"
          onClick={cycle}
          aria-label={`Status de ${m.title}: ${meta.label}. Tocar para mudar`}
          className={cn('shrink-0 h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap active:scale-95 transition', meta.cls)}
        >
          {meta.label}
        </button>
        <IconButton label={open ? 'Fechar detalhes' : `Detalhes de ${m.title}`} size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <MoreHorizontal size={17} />
        </IconButton>
      </div>
      {open && (
        <div className="pb-2.5 pt-1 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[12px] text-muted px-1">Data (opcional)</span>
              <DateInput aria-label="Data do item" className="!min-h-10 !py-1.5 text-[14px]" value={m.date} onChange={(v) => actions.update('milestones', m.id, { date: v })} />
            </label>
            <label className="block">
              <span className="text-[12px] text-muted px-1">Grupo</span>
              <input
                className="input !min-h-10 !py-1.5 text-[14px]"
                list={`roadmap-groups-${m.projectId}`}
                defaultValue={m.group ?? ''}
                aria-label="Grupo"
                onBlur={(e) => {
                  const g = e.target.value.trim() || undefined
                  if (g !== m.group) actions.update('milestones', m.id, { group: g })
                }}
              />
              <datalist id={`roadmap-groups-${m.projectId}`}>
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </label>
          </div>
          <Button variant="ghost" size="sm" className="text-muted" onClick={() => removeWithUndo('milestones', m.id, 'Item removido do roadmap')}>
            Remover do roadmap
          </Button>
        </div>
      )}
    </div>
  )
}
