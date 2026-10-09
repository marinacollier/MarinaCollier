/** Opportunity · Contact · Evidence sheets. One required field each; the rest in "mais opções". */
import { useState } from 'react'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { useDB } from '@/data/store'
import { OPP_STATUS_LABEL, addContact, addOpportunity, logInteraction, promoteToEvidence, setOpportunityStatus, updateOpportunity } from '@/data/career/pipeline'
import { actions } from '@/data/store'
import type { OpportunityStatus, ProfessionalWin } from '@/data/types'
import { DateInput, Field, MoreOptions, Segmented, SheetLayout, TextArea, TextInput, TitleInput } from '@/components/ui'
import { LockGate } from '@/components/layout/LockGate'
import { useToday } from '@/hooks/useToday'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'

const done = (msg: string, undo?: () => void) => {
  haptic('success')
  toast(msg, undo ? { action: { label: 'Desfazer', run: undo } } : undefined)
  closeSheet()
}

const STATUSES = Object.keys(OPP_STATUS_LABEL) as OpportunityStatus[]

export function OpportunitySheet({ id }: SheetProps<'opportunity'>) {
  return (
    <LockGate area="carreira" compact>
      <OpportunityForm id={id} />
    </LockGate>
  )
}

function OpportunityForm({ id }: SheetProps<'opportunity'>) {
  const today = useToday()
  const o = useDB((db) => db.opportunities.find((x) => x.id === id))
  const [role, setRole] = useState(o?.role ?? '')
  const [company, setCompany] = useState(o?.company ?? '')
  const [status, setStatus] = useState<OpportunityStatus>(o?.status ?? 'radar')
  const [nextAction, setNextAction] = useState(o?.nextAction ?? '')
  const [nextDate, setNextDate] = useState(o?.nextActionDate)
  const [country, setCountry] = useState(o?.country ?? '')
  const [comp, setComp] = useState(o?.compensation ?? '')
  const [workModel, setWorkModel] = useState(o?.workModel)
  const [notes, setNotes] = useState(o?.notes ?? '')
  const valid = role.trim() && company.trim()
  const save = () => {
    if (!valid) return
    const fields = { role: role.trim(), company: company.trim(), nextAction: nextAction || undefined, nextActionDate: nextDate, country: country || undefined, compensation: comp || undefined, workModel, notes: notes || undefined }
    if (!o) return done('Oportunidade no pipeline ✓', addOpportunity({ ...fields, status }, today).undo)
    const u1 = updateOpportunity(o.id, fields, today)
    const u2 = status !== o.status ? setOpportunityStatus(o.id, status, today) : undefined
    done('Atualizado ✓', () => {
      u2?.()
      u1()
    })
  }
  return (
    <SheetLayout
      title={o ? `${o.role} · ${o.company}` : 'Nova oportunidade'}
      eyebrow="pipeline"
      onClose={closeSheet}
      onDelete={o ? () => { removeWithUndo('opportunities', o.id, 'Oportunidade apagada'); closeSheet() } : undefined}
      primary={{ label: o ? 'Salvar' : 'Adicionar', onClick: save, disabled: !valid }}
    >
      <TitleInput autoFocus={!o} placeholder="Cargo (ex.: Head of Product)" value={role} onChange={(e) => setRole(e.target.value)} />
      <Field label="Empresa">
        <TextInput value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Empresa" />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={cn('h-8 px-3 rounded-full border text-[12.5px]', status === s ? 'bg-ink text-bg border-ink' : 'border-line text-ink-2')}>
            {OPP_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <Field label="Próxima ação">
        <TextInput value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="mandar follow-up, preparar case…" />
      </Field>
      <Field label="Quando">
        <DateInput value={nextDate} onChange={setNextDate} />
      </Field>
      <MoreOptions>
        <Field label="País">
          <TextInput value={country} onChange={(e) => setCountry(e.target.value)} />
        </Field>
        <Field label="Modelo">
          <Segmented value={workModel ?? 'remoto'} onChange={(v) => setWorkModel(v as typeof workModel)} options={[{ value: 'remoto', label: 'remoto' }, { value: 'hibrido', label: 'híbrido' }, { value: 'presencial', label: 'presencial' }]} />
        </Field>
        <Field label="Remuneração" hint="como você souber (ex.: R$ 40–45k CLT)">
          <TextInput value={comp} onChange={(e) => setComp(e.target.value)} />
        </Field>
        <Field label="Notas">
          <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}

export function ContactSheet({ id }: SheetProps<'contact'>) {
  return (
    <LockGate area="carreira" compact>
      <ContactForm id={id} />
    </LockGate>
  )
}

function ContactForm({ id }: SheetProps<'contact'>) {
  const today = useToday()
  const c = useDB((db) => db.contacts.find((x) => x.id === id))
  const [name, setName] = useState(c?.name ?? '')
  const [company, setCompany] = useState(c?.company ?? '')
  const [role, setRole] = useState(c?.role ?? '')
  const [follow, setFollow] = useState(c?.nextFollowUp)
  const [notes, setNotes] = useState(c?.notes ?? '')
  const save = () => {
    if (!name.trim()) return
    const fields = { name: name.trim(), company: company || undefined, role: role || undefined, nextFollowUp: follow, notes: notes || undefined }
    if (!c) return done('Pessoa guardada ✓', addContact(fields).undo)
    const before = { ...c }
    actions.update('contacts', c.id, fields)
    done('Atualizado ✓', () => actions.update('contacts', c.id, before))
  }
  return (
    <SheetLayout
      title={c ? c.name : 'Nova pessoa'}
      eyebrow="networking"
      onClose={closeSheet}
      onDelete={c ? () => { removeWithUndo('contacts', c.id, 'Contato apagado'); closeSheet() } : undefined}
      primary={{ label: c ? 'Salvar' : 'Adicionar', onClick: save, disabled: !name.trim() }}
    >
      <TitleInput autoFocus={!c} placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
      <Field label="Empresa">
        <TextInput value={company} onChange={(e) => setCompany(e.target.value)} />
      </Field>
      <Field label="Próximo follow-up">
        <DateInput value={follow} onChange={setFollow} />
      </Field>
      {c && (
        <button type="button" onClick={() => done(`Conversa com ${c.name} anotada ✓`, logInteraction(c.id, today))} className="h-10 px-4 rounded-full bg-surface-2 text-[13.5px]">
          Falei com {c.name.split(' ')[0]} hoje
        </button>
      )}
      <MoreOptions>
        <Field label="Cargo">
          <TextInput value={role} onChange={(e) => setRole(e.target.value)} />
        </Field>
        <Field label="Notas">
          <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {c?.interactions?.length ? <p className="text-[12.5px] text-muted">{c.interactions.length} conversa(s) registrada(s) · última {c.lastInteraction}</p> : null}
      </MoreOptions>
    </SheetLayout>
  )
}

export function EvidenceSheet({ id }: SheetProps<'evidence'>) {
  return (
    <LockGate area="carreira" compact>
      <EvidenceForm id={id} />
    </LockGate>
  )
}

function EvidenceForm({ id }: SheetProps<'evidence'>) {
  const w = useDB((db) => db.wins.find((x) => x.id === id))
  const [context, setContext] = useState(w?.context ?? '')
  const [responsibility, setResp] = useState(w?.responsibility ?? '')
  const [decision, setDecision] = useState(w?.decision ?? '')
  const [impact, setImpact] = useState(w?.impact ?? '')
  const [metrics, setMetrics] = useState(w?.metrics ?? '')
  const [conf, setConf] = useState<NonNullable<ProfessionalWin['confidentiality']>>(w?.confidentiality ?? 'interno')
  const [verified, setVerified] = useState(w?.verification === 'verificado')
  if (!w) return null
  const save = () => {
    const patch = { context: context || undefined, responsibility: responsibility || undefined, decision: decision || undefined, impact: impact || undefined, metrics: metrics || undefined, confidentiality: conf, verification: verified ? ('verificado' as const) : ('rascunho' as const) }
    done(w.evidence ? 'Case atualizado ✓' : 'Virou case ✓', promoteToEvidence(w.id, patch))
  }
  return (
    <SheetLayout title={w.title} eyebrow={w.evidence ? 'case' : 'transformar em case'} onClose={closeSheet} primary={{ label: 'Salvar case', onClick: save }}>
      <Field label="Contexto">
        <TextArea rows={2} value={context} onChange={(e) => setContext(e.target.value)} placeholder="qual era o problema / cenário" />
      </Field>
      <Field label="Minha responsabilidade">
        <TextArea rows={2} value={responsibility} onChange={(e) => setResp(e.target.value)} />
      </Field>
      <Field label="Decisão que tomei">
        <TextArea rows={2} value={decision} onChange={(e) => setDecision(e.target.value)} />
      </Field>
      <Field label="Impacto">
        <TextArea rows={2} value={impact} onChange={(e) => setImpact(e.target.value)} />
      </Field>
      <Field label="Métricas" hint="só números reais — sem número, fica marcado “sem métricas”">
        <TextArea rows={2} value={metrics} onChange={(e) => setMetrics(e.target.value)} />
      </Field>
      <Field label="Confidencialidade">
        <Segmented value={conf} onChange={setConf} options={[{ value: 'publico', label: 'público' }, { value: 'interno', label: 'interno' }, { value: 'confidencial', label: 'confidencial' }]} />
      </Field>
      <label className="flex items-center gap-2 text-[14px]">
        <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> números conferidos
      </label>
    </SheetLayout>
  )
}
