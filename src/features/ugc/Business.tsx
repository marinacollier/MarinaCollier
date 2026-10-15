/**
 * UGC Business — CRM Marcas views inside the UGC space: the commercial dashboard (every card a count of ONE
 * kind of record, tap/hover reveals them), the day's UGC tasks (existing Tasks — the same check as Home),
 * the rest of the week, Portfólio, Financeiro, the brand CRM card and "Importar CRM". Every list uses ItemRow.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ExternalLink, Pencil } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { Card, Checkbox, Chip, ItemList, ItemRow, SectionTitle } from '@/components/ui'
import { persist, useDB } from '@/data/store'
import { carriedOverTasks, isTaskDoneOn, tasksForDay } from '@/data/selectors'
import type { Brand, ContentItem, DateKey, Task, UgcCrmStatus, UgcDemo } from '@/data/types'
import { COUPONS_CONFIRMED_IN_SHEET, CRM_STATUS_LABEL, CRM_STATUSES, crmDashboard, isUgcTask, nextActionOf, TASK_STATE_LABEL, taskState, ugcMoney, type DashCard, type UgcTaskState } from '@/data/ugc/crm'
import { addCoupon, addPressKit, addStep, importCrmText, patchContent, patchDemo, removeCoupon, removePressKit, removeStep, rescheduleTask, setCrmStatus, setUgcTaskState, toggleStep } from '@/data/ugc/crm-ops'
import { setTaskDone } from '@/features/tasks/ops'
import { useToday } from '@/hooks/useToday'
import { endOfWeek, formatDayMonth, relativeDay, startOfWeek } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { uid } from '@/lib/id'
import { cn } from '@/lib/cn'
import { commit } from './parts'

const BRL = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─── Dashboard ──────────────────────────────────────────────────────────────

export function CrmDashboard() {
  const db = useDB()
  const cards = useMemo(() => crmDashboard(db), [db])
  const [open, setOpen] = useState<string | undefined>()
  const canHover = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches
  const card = cards.find((c) => c.id === open)
  return (
    <section aria-label="Painel comercial">
      <SectionTitle>Painel comercial</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" onMouseLeave={() => canHover && setOpen(undefined)}>
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-expanded={open === c.id}
            aria-controls="ugc-dash-records"
            onClick={() => setOpen(open === c.id ? undefined : c.id)}
            onMouseEnter={() => canHover && setOpen(c.id)}
            className={cn('text-left rounded-2xl px-3 py-2.5 min-h-[64px] transition active:scale-[0.98]', open === c.id ? 'bg-ink text-bg' : 'bg-surface-2 text-ink')}
          >
            <span className="block font-sport text-[22px] tabular-nums leading-none">{c.value}</span>
            <span className={cn('block text-[12px] mt-1', open === c.id ? 'text-bg/80' : 'text-muted')}>{c.label}</span>
          </button>
        ))}
      </div>
      {card && <DashRecords card={card} />}
    </section>
  )
}

function DashRecords({ card }: { card: DashCard }) {
  return (
    <Card id="ugc-dash-records" className="mt-2">
      <p className="text-[13px] font-medium mb-1">
        {card.label} · {card.value}
      </p>
      {card.note && <p className="text-[12.5px] text-muted mb-1">{card.note}</p>}
      {card.records.length ? (
        <ItemList className="max-h-72 overflow-y-auto">
          {card.records.map((r) => (
            <ItemRow key={r.id} title={r.title} meta={r.sub} to={r.brandId ? ROUTES.ugcBrand(r.brandId) : undefined} />
          ))}
        </ItemList>
      ) : (
        <p className="text-[13.5px] text-muted">Nenhum registro.</p>
      )}
    </Card>
  )
}

// ─── Tasks (existing Tasks; same check as Home) ─────────────────────────────

const STATES = Object.keys(TASK_STATE_LABEL) as UgcTaskState[]

export function UgcTaskRow({ task, date }: { task: Task; date: DateKey }) {
  const db = useDB()
  const today = useToday()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('')
  const done = isTaskDoneOn(db, task, date)
  const state = taskState(task)
  const brand = task.brandId ? db.brands.find((b) => b.id === task.brandId) : undefined
  const project = task.projectId ? db.projects.find((p) => p.id === task.projectId) : undefined
  const demo = task.contentItemId ? db.contentItems.find((c) => c.id === task.contentItemId) : undefined
  // One quiet fact: the brand (or project), else the state.
  const meta = brand?.name ?? (project ? `${project.emoji} ${project.name}` : TASK_STATE_LABEL[state])
  const when = task.time ?? (task.dueDate ? `prazo ${relativeDay(task.dueDate, today)}` : task.date && task.date !== date ? relativeDay(task.date, today) : undefined)
  const next = nextActionOf(task)
  const tick = (v: boolean) => {
    setTaskDone(task.id, v, date)
    void persist()
    if (v) haptic('success')
    toast(v ? 'Feito ✓' : 'Desmarcado', { action: { label: 'Desfazer', run: () => (setTaskDone(task.id, !v, date), void persist()) } })
  }
  return (
    <>
      <ItemRow
        title={task.title}
        meta={next && !done ? `→ ${next}` : meta}
        when={when}
        priority={task.priority === 'alta' ? 1 : task.priority === 'media' ? 2 : undefined}
        late={!!task.dueDate && task.dueDate < today}
        checked={done}
        onCheck={tick}
        onOpen={() => setOpen((o) => !o)}
        trailing={<ChevronDown size={16} className={cn('text-muted shrink-0 transition', open && 'rotate-180')} aria-hidden />}
      />
      {open && (
        <li className="pl-9 pr-1 pb-3 pt-1 space-y-3">
          {task.notes && <p className="text-[13px] text-ink-2 whitespace-pre-line">{task.notes}</p>}
          <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-1.5">
            {STATES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={state === s} onClick={() => commit(() => setUgcTaskState(task.id, s, today), `${TASK_STATE_LABEL[s]} ✓`)} className={cn('h-8 px-2.5 rounded-full text-[12.5px]', state === s ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
                {TASK_STATE_LABEL[s]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-muted">Reagendar para</span>
            <input type="date" className="input h-9" value={task.date ?? ''} min={today} onChange={(e) => e.target.value && commit(() => rescheduleTask(task.id, e.target.value), `Reagendada para ${formatDayMonth(e.target.value)} ✓`)} aria-label="Nova data" />
          </label>
          {task.postponedFrom && <p className="text-[12.5px] text-muted">Planejada antes para {formatDayMonth(task.postponedFrom)}.</p>}
          <div>
            <p className="text-[12.5px] text-muted mb-1">Subtarefas</p>
            <ul>
              {(task.checklist ?? []).map((s) => (
                <li key={s.id} className="flex items-center gap-2 min-h-[40px]">
                  <span className="pl-1.5">
                    <Checkbox size="sm" checked={s.done} onChange={() => commit(() => toggleStep(task.id, s.id), s.done ? 'Desmarcado' : `${s.title} ✓`)} label={s.title} />
                  </span>
                  <span className={cn('flex-1 text-[14px]', s.done && 'line-through text-muted')}>{s.title}</span>
                  <button type="button" className="text-[12px] text-muted h-8 px-2" onClick={() => commit(() => removeStep(task.id, s.id), 'Subtarefa removida')} aria-label={`Remover ${s.title}`}>
                    remover
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2 mt-1"
              onSubmit={(e) => {
                e.preventDefault()
                if (!step.trim()) return
                commit(() => addStep(task.id, step), 'Subtarefa ✓')
                setStep('')
              }}
            >
              <input value={step} onChange={(e) => setStep(e.target.value)} placeholder="Nova subtarefa" className="input flex-1 min-w-0 h-9" aria-label="Nova subtarefa" />
              <button type="submit" disabled={!step.trim()} className="h-9 px-3 rounded-full bg-surface-2 text-[13px] disabled:opacity-40">
                Adicionar
              </button>
            </form>
          </div>
          <div className="flex flex-wrap gap-3 text-[13px]">
            {brand && (
              <Link to={ROUTES.ugcBrand(brand.id)} className="text-accent inline-flex items-center gap-1">
                <ExternalLink size={13} /> {brand.name}
              </Link>
            )}
            {demo && (
              <Link to={`${ROUTES.ugc}?aba=producao`} className="text-accent inline-flex items-center gap-1">
                <ExternalLink size={13} /> {demo.title}
              </Link>
            )}
            <button type="button" onClick={() => openSheet('task', { id: task.id })} className="text-accent inline-flex items-center gap-1">
              <Pencil size={13} /> Editar hora, dia, notas
            </button>
          </div>
        </li>
      )}
    </>
  )
}

export function UgcTasksToday() {
  const db = useDB()
  const today = useToday()
  const list = useMemo(() => {
    const seen = new Set<string>()
    return [...carriedOverTasks(db, today), ...tasksForDay(db, today)].filter((t) => isUgcTask(t) && t.status !== 'archived' && !seen.has(t.id) && !!seen.add(t.id))
  }, [db, today])
  const done = list.filter((t) => isTaskDoneOn(db, t, today)).length
  if (!list.length) return null
  return (
    <section aria-label="Hoje — UGC Business">
      <SectionTitle action={<span className="text-[12.5px] text-muted tabular-nums">{done}/{list.length}</span>}>Tarefas de hoje</SectionTitle>
      <ItemList>
        {list.map((t) => (
          <UgcTaskRow key={t.id} task={t} date={today} />
        ))}
      </ItemList>
    </section>
  )
}

// ─── Resto da semana (inside Hoje) ──────────────────────────────────────────

export function UgcWeek() {
  const db = useDB()
  const today = useToday()
  const from = startOfWeek(today)
  const to = endOfWeek(today)
  // Today's tasks are already above; this is what's still ahead this week.
  const tasks = db.tasks
    .filter((t) => isUgcTask(t) && t.status !== 'archived')
    .filter((t) => [t.date, t.dueDate].some((d) => !!d && d > today && d <= to) || (t.bucket === 'semana' && !t.date && !t.dueDate && t.status !== 'done'))
    .sort((a, b) => (a.date ?? a.dueDate ?? '9').localeCompare(b.date ?? b.dueDate ?? '9') || a.order - b.order)
  const followUps = db.ugcOpportunities.filter((o) => o.nextFollowUpAt && o.nextFollowUpAt <= to && (o.followUpWindowEnd ?? o.nextFollowUpAt) >= from && !['recusada', 'perdida', 'concluida', 'pausada'].includes(o.status))
  if (!tasks.length && !followUps.length) return null
  return (
    <section aria-label="Resto da semana">
      <SectionTitle action={<span className="text-[12.5px] text-muted tabular-nums">até {formatDayMonth(to)}</span>}>Resto da semana</SectionTitle>
      <ItemList>
        {tasks.map((t) => (
          <UgcTaskRow key={t.id} task={t} date={t.date && t.date >= from ? t.date : today} />
        ))}
        {followUps.map((o) => (
          <ItemRow
            key={o.id}
            title={`Follow-up ${db.brands.find((b) => b.id === o.brandId)?.name ?? o.title}`}
            meta="só se não responder"
            when={`${formatDayMonth(o.nextFollowUpAt!)}${o.followUpWindowEnd ? `–${formatDayMonth(o.followUpWindowEnd)}` : ''}`}
            to={ROUTES.ugcBrand(o.brandId)}
          />
        ))}
      </ItemList>
    </section>
  )
}

// ─── Portfólio e produção ───────────────────────────────────────────────────

const EDIT_LABEL: Record<UgcDemo['editStatus'], string> = { nao_iniciada: 'Não iniciada', editando: 'Editando', revisao: 'Revisão', pronta: 'Pronta' }

export function UgcPortfolio() {
  const items = useDB((db) => db.contentItems).filter((c) => c.demo)
  return (
    <section aria-label="Portfólio">
      <SectionTitle className="mt-0">Portfólio</SectionTitle>
      {items.length ? (
        <ItemList>
          {items.map((c) => (
            <DemoCard key={c.id} c={c} />
          ))}
        </ItemList>
      ) : (
        <p className="text-[14px] text-muted px-1">Nenhum projeto demonstrativo.</p>
      )}
    </section>
  )
}

function DemoCard({ c }: { c: ContentItem }) {
  const brands = useDB((db) => db.brands)
  const [open, setOpen] = useState(false)
  const [scene, setScene] = useState('')
  const d = c.demo!
  const b = c.brandId ? brands.find((x) => x.id === c.brandId) : undefined
  const done = d.scenes.filter((s) => s.done).length
  const save = (p: Partial<UgcDemo>, msg = 'Salvo ✓') => commit(() => patchDemo(c.id, p), msg)
  return (
    <>
      <ItemRow
        title={c.title}
        meta={d.inPortfolio ? 'no portfólio' : `${done}/${d.scenes.length} cenas · ${EDIT_LABEL[d.editStatus].toLowerCase()}`}
        when={d.recordDate ? formatDayMonth(d.recordDate) : undefined}
        onOpen={() => setOpen((o) => !o)}
        trailing={<ChevronDown size={16} className={cn('text-muted shrink-0 transition', open && 'rotate-180')} aria-hidden />}
      />
      {open && (
        <li className="pl-9 pr-1 pb-3 pt-1 space-y-3">
          <label className="block text-[12.5px] text-muted">
            Roteiro
            <textarea key={c.script} defaultValue={c.script ?? ''} rows={4} className="input w-full mt-1 py-2" onBlur={(e) => e.target.value.trim() !== (c.script ?? '') && commit(() => patchContent(c.id, { script: e.target.value.trim() || undefined }), 'Roteiro salvo ✓')} />
          </label>
          <div>
            <p className="text-[12.5px] text-muted mb-1">Checklist de cenas</p>
            <ul>
              {d.scenes.map((s) => (
                <li key={s.id} className="flex items-center gap-2 min-h-[40px]">
                  <span className="pl-1.5">
                    <Checkbox size="sm" checked={s.done} label={s.title} onChange={() => save({ scenes: d.scenes.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} />
                  </span>
                  <span className={cn('flex-1 text-[14px]', s.done && 'line-through text-muted')}>{s.title}</span>
                  <button type="button" className="text-[12px] text-muted h-8 px-2" onClick={() => save({ scenes: d.scenes.filter((x) => x.id !== s.id) }, 'Cena removida')}>
                    remover
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2 mt-1"
              onSubmit={(e) => {
                e.preventDefault()
                if (!scene.trim()) return
                save({ scenes: [...d.scenes, { id: uid(), title: scene.trim(), done: false }] }, 'Cena ✓')
                setScene('')
              }}
            >
              <input value={scene} onChange={(e) => setScene(e.target.value)} placeholder="Nova cena" className="input flex-1 min-w-0 h-9" aria-label="Nova cena" />
              <button type="submit" disabled={!scene.trim()} className="h-9 px-3 rounded-full bg-surface-2 text-[13px] disabled:opacity-40">
                Adicionar
              </button>
            </form>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-muted w-28">Data de gravação</span>
            <input type="date" className="input h-9" value={d.recordDate ?? ''} onChange={(e) => save({ recordDate: e.target.value || undefined })} />
          </label>
          <label className="block text-[12.5px] text-muted">
            Arquivos (opcional — link ou pasta)
            <input key={d.files} defaultValue={d.files ?? ''} className="input w-full mt-1 h-9" onBlur={(e) => e.target.value.trim() !== (d.files ?? '') && save({ files: e.target.value.trim() || undefined })} />
          </label>
          <div role="radiogroup" aria-label="Status de edição" className="flex flex-wrap gap-1.5">
            {(Object.keys(EDIT_LABEL) as UgcDemo['editStatus'][]).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={d.editStatus === s} onClick={() => save({ editStatus: s }, `Edição: ${EDIT_LABEL[s].toLowerCase()} ✓`)} className={cn('h-8 px-2.5 rounded-full text-[12.5px]', d.editStatus === s ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
                {EDIT_LABEL[s]}
              </button>
            ))}
          </div>
          <label className="block text-[12.5px] text-muted">
            Versão final (link)
            <input key={d.finalVersion} defaultValue={d.finalVersion ?? ''} className="input w-full mt-1 h-9" onBlur={(e) => e.target.value.trim() !== (d.finalVersion ?? '') && save({ finalVersion: e.target.value.trim() || undefined })} />
          </label>
          <label className="flex items-center gap-2 text-[14px] min-h-[40px]">
            <input type="checkbox" checked={d.inPortfolio} onChange={(e) => save({ inPortfolio: e.target.checked }, e.target.checked ? 'No portfólio ✓' : 'Fora do portfólio')} className="h-5 w-5" />
            Publicado no portfólio
          </label>
          {b && (
            <Link to={ROUTES.ugcBrand(b.id)} className="text-[13px] text-accent inline-flex items-center gap-1">
              <ExternalLink size={13} /> {b.name}
            </Link>
          )}
        </li>
      )}
    </>
  )
}

// ─── Financeiro ─────────────────────────────────────────────────────────────

export function UgcFinance() {
  const db = useDB()
  const m = useMemo(() => ugcMoney(db), [db])
  const nameOf = (id: string) => db.brands.find((b) => b.id === id)?.name ?? 'Marca'
  return (
    <section aria-label="Financeiro">
      <SectionTitle>Financeiro</SectionTitle>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Contratos pagos', String(m.paid.length)],
          ['Recebido', BRL(m.receivedCents)],
          ['A receber', BRL(m.receivableCents)],
        ].map(([l, v]) => (
          <Card key={l} className="px-2">
            <div className="font-sport text-[20px] tabular-nums leading-none">{v}</div>
            <div className="text-[12px] text-muted mt-1">{l}</div>
          </Card>
        ))}
      </div>
      <p className="text-[12.5px] text-muted px-1 mt-2">Só UGC pago conta como receita.</p>
      {m.paid.length > 0 && (
        <ItemList className="mt-2">
          {m.paid.map((o) => (
            <ItemRow
              key={o.id}
              title={nameOf(o.brandId)}
              meta={o.agreedValueCents ? BRL(o.agreedValueCents) : undefined}
              when={o.paidAt ? `pago ${formatDayMonth(o.paidAt)}` : o.agreedAt ? formatDayMonth(o.agreedAt) : undefined}
              to={ROUTES.ugcBrand(o.brandId)}
            />
          ))}
        </ItemList>
      )}
    </section>
  )
}

// ─── Brand CRM card (BrandPage) ─────────────────────────────────────────────

export function BrandCrmSection({ brand }: { brand: Brand }) {
  const today = useToday()
  const [code, setCode] = useState('')
  const crm = brand.crm ?? {}
  return (
    <section aria-label="CRM da marca">
      <SectionTitle>Relacionamento (CRM)</SectionTitle>
      <Card className="space-y-3">
        <div role="radiogroup" aria-label="Status de relacionamento" className="flex flex-wrap gap-1.5">
          {CRM_STATUSES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={crm.status === s} onClick={() => commit(() => setCrmStatus(brand.id, crm.status === s ? undefined : s, today), `${CRM_STATUS_LABEL[s]} ✓`)} className={cn('min-h-8 px-2.5 py-1 rounded-full text-[12.5px] text-left', crm.status === s ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
              {CRM_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {(crm.statusAt || crm.evidence) && (
          <p className="text-[12.5px] text-muted">
            {crm.statusAt ? `Desde ${formatDayMonth(crm.statusAt)}. ` : ''}
            {crm.evidence}
          </p>
        )}
        {crm.noFollowUp && <p className="text-[12.5px] text-muted">Sem follow-up comercial automático.</p>}
        {!!brand.aliases?.length && <p className="text-[12.5px] text-muted">Também escrita como: {brand.aliases.join(', ')}</p>}
        <div>
          <p className="text-[12.5px] text-muted mb-1">Press kits (histórico, não pagamento)</p>
          {(crm.pressKits ?? []).map((k, i) => (
            <div key={i} className="flex items-center justify-between text-[14px] min-h-[36px]">
              <span>Press kit recebido{k.receivedAt ? ` em ${formatDayMonth(k.receivedAt)}` : ''}</span>
              <button type="button" className="text-[12px] text-muted h-8 px-2" onClick={() => commit(() => removePressKit(brand.id, i), 'Press kit removido')}>
                remover
              </button>
            </div>
          ))}
          <button type="button" className="text-[13px] text-accent h-8" onClick={() => commit(() => addPressKit(brand.id, today), 'Press kit registrado ✓')}>
            + press kit recebido hoje
          </button>
        </div>
        <div>
          <p className="text-[12.5px] text-muted mb-1">Cupons</p>
          {(crm.coupons ?? []).map((c, i) => (
            <div key={i} className="flex items-center justify-between text-[14px] min-h-[36px]">
              <span>{c.code ?? 'cupom confirmado · código não informado'}</span>
              <button type="button" className="text-[12px] text-muted h-8 px-2" onClick={() => commit(() => removeCoupon(brand.id, i), 'Cupom removido')}>
                remover
              </button>
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              commit(() => addCoupon(brand.id, code), 'Cupom ✓')
              setCode('')
            }}
          >
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código do cupom (opcional)" className="input flex-1 min-w-0 h-9" aria-label="Código do cupom" />
            <button type="submit" className="h-9 px-3 rounded-full bg-surface-2 text-[13px]">
              Adicionar
            </button>
          </form>
        </div>
      </Card>
    </section>
  )
}

// ─── Importar CRM (paste) ───────────────────────────────────────────────────

export function CrmImport() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [result, setResult] = useState<ReturnType<typeof importCrmText> | undefined>()
  const run = () => {
    let r: ReturnType<typeof importCrmText> | undefined
    commit(() => {
      r = importCrmText(text)
      return r.undo
    }, 'CRM reconciliado ✓')
    setResult(r)
  }
  return (
    <section aria-label="Importar CRM">
      <SectionTitle>Importar CRM</SectionTitle>
      {!open ? (
        <button type="button" className="text-[14px] text-accent h-10" onClick={() => setOpen(true)}>
          Colar a planilha CRM Marcas (CSV ou JSON)…
        </button>
      ) : (
        <Card className="space-y-2">
          <p className="text-[12.5px] text-muted">
            Primeira linha com os títulos (Marca, Status, Data, Cupom, Press kit, Categoria, Notas). Marcas com o mesmo nome (ou apelido conhecido: Feelgoomy, Snug, Z2, Vitergel) viram uma só; nada mais recente seu é sobrescrito. A planilha cita {COUPONS_CONFIRMED_IN_SHEET} cupons confirmados.
          </p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="input w-full py-2 font-mono text-[12px]" aria-label="Planilha colada" placeholder={'Marca;Status;Data;Cupom\nHardyn;Afiliada — sem vagas;;CODIGO'} />
          <button type="button" disabled={!text.trim()} onClick={run} className="h-10 px-4 rounded-full bg-ink text-bg text-[14px] disabled:opacity-40">
            Reconciliar
          </button>
          {result && (
            <div className="text-[13px] space-y-1" role="status">
              <p>
                {result.rows} linhas · {result.report.created.length} novas · {result.report.updated.length} atualizadas · {result.report.unchanged.length} sem mudança
              </p>
              {result.report.created.length > 0 && <p className="text-muted">Novas: {result.report.created.join(', ')}</p>}
              {result.report.updated.length > 0 && <p className="text-muted">Atualizadas: {result.report.updated.join(', ')}</p>}
              {result.report.skipped.map((s) => (
                <p key={s.name} className="text-muted">
                  {s.name}: {s.reason}
                </p>
              ))}
              {result.warnings.map((w) => (
                <p key={w} className="text-muted">
                  {w}
                </p>
              ))}
            </div>
          )}
        </Card>
      )}
    </section>
  )
}

/** Filter chips for "Todas as marcas" by CRM status. */
export function CrmFilter({ value, onChange, counts }: { value?: UgcCrmStatus; onChange: (v?: UgcCrmStatus) => void; counts: Record<string, number> }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
      {CRM_STATUSES.filter((s) => counts[s]).map((s) => (
        <Chip key={s} selected={value === s} onClick={() => onChange(value === s ? undefined : s)} className="whitespace-nowrap shrink-0">
          {CRM_STATUS_LABEL[s]} {counts[s]}
        </Chip>
      ))}
    </div>
  )
}
