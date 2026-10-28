/**
 * Expedição fields inside the trip item sheet. Every field is optional; the sheet saves the draft
 * together with its own fields. Grouped in quiet disclosures so a quick edit stays quick.
 */
import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Trip, TripBooking, TripCertainty, TripChecklistKind, TripItem } from '@/data/types'
import { Checkbox, Field, MoreOptions, NumberInput, Select, TextArea, TextInput, TimeInput } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatLongDate } from '@/lib/date'
import { BOOKING_META, BOOKING_ORDER, CANCEL_REASON_LABEL, CERTAINTY_META, CERTAINTY_ORDER, CHECKLIST_LABEL, classClash } from './logic'
import { CentsInput, MapLinks } from './ui'

/** The expedition part of a TripItem (what this component edits). */
export type ExpeditionDraft = Pick<
  TripItem,
  | 'certainty'
  | 'booking'
  | 'endTime'
  | 'wakeTime'
  | 'prepTime'
  | 'leaveTime'
  | 'returnTime'
  | 'address'
  | 'route'
  | 'travelMinutes'
  | 'currency'
  | 'estimatedCents'
  | 'quotedCents'
  | 'paidCents'
  | 'uberCents'
  | 'outfit'
  | 'checklistKind'
  | 'contact'
  | 'voucherUrl'
  | 'supplier'
  | 'cancellationPolicy'
  | 'pickup'
  | 'needsPickup'
  | 'pickupConfirmed'
  | 'risk'
  | 'planB'
  | 'schoolImpact'
  | 'schoolMadeUp'
  | 'clearance'
  | 'optional'
  | 'flexible'
  | 'indoor'
  | 'opportunityCost'
  | 'cancelReason'
  | 'volunteer'
>

export const DRAFT_KEYS: (keyof ExpeditionDraft)[] = [
  'certainty', 'booking', 'endTime', 'wakeTime', 'prepTime', 'leaveTime', 'returnTime', 'address', 'route', 'travelMinutes', 'currency',
  'estimatedCents', 'quotedCents', 'paidCents', 'uberCents', 'outfit', 'checklistKind', 'contact', 'voucherUrl', 'supplier', 'cancellationPolicy',
  'pickup', 'needsPickup', 'pickupConfirmed', 'risk', 'planB', 'schoolImpact', 'schoolMadeUp', 'clearance', 'optional', 'flexible', 'indoor',
  'opportunityCost', 'cancelReason', 'volunteer',
]

export function draftOf(i?: TripItem): ExpeditionDraft {
  const d: ExpeditionDraft = {}
  if (!i) return d
  for (const k of DRAFT_KEYS) if (i[k] !== undefined) (d as Record<string, unknown>)[k] = i[k]
  return d
}

/** Empty strings/false become undefined so an untouched field never lands in the record. */
export function cleanDraft(d: ExpeditionDraft): ExpeditionDraft {
  const out: Record<string, unknown> = {}
  for (const k of DRAFT_KEYS) {
    let v = d[k] as unknown
    if (typeof v === 'string') v = v.trim() || undefined
    if (v === false) v = undefined
    out[k] = v
  }
  const u = out.voucherUrl as string | undefined
  if (u && !/^https?:\/\//i.test(u)) out.voucherUrl = `https://${u}`
  return out as ExpeditionDraft
}

function Chips<T extends string>({ value, options, onPick, label }: { value?: T; options: { value: T; label: string; cls?: string }[]; onPick: (v: T | undefined) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onPick(value === o.value ? undefined : o.value)}
          className={cn('h-9 px-3 rounded-full text-[12.5px] font-semibold border-2 transition', o.cls ?? 'bg-surface-2 text-ink-2', value === o.value ? 'border-ink' : 'border-transparent opacity-85')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ checked, onChange, children }: { checked?: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-3 min-h-11 text-[14px]">
      <Checkbox size="sm" checked={!!checked} label={typeof children === 'string' ? children : 'opção'} onChange={onChange} />
      <span>{children}</span>
    </label>
  )
}

export function ExpeditionFields({
  trip,
  draft,
  set,
  when,
  status,
  onBooking,
}: {
  trip: Trip
  draft: ExpeditionDraft
  set: (patch: ExpeditionDraft) => void
  /** Date/time being edited in the sheet (for the class warning). */
  when: Pick<TripItem, 'date' | 'endDate' | 'time' | 'section'>
  status: TripItem['status']
  /** Booking picked → the sheet keeps status/payment in step. */
  onBooking: (b: TripBooking | undefined) => void
}) {
  const cur = draft.currency ?? trip.expedition?.currency ?? 'BRL'
  const clash = trip.expedition ? classClash(trip, { ...when, ...draft }) : undefined
  const has = (...k: (keyof ExpeditionDraft)[]) => k.some((x) => draft[x] !== undefined)
  return (
    <div className="space-y-3">
      {clash && (
        <div className="flex gap-2 rounded-xl bg-sand-soft px-3 py-2.5 text-[13px] text-ink-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Cruza a aula de {formatLongDate(clash.date)} ({clash.block.start}–{clash.block.end}). Antes de reservar: mude o horário ou marque o impacto na escola.
          </span>
        </div>
      )}

      <div>
        <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Certeza</div>
        <Chips label="Certeza" value={draft.certainty} onPick={(v) => set({ certainty: v as TripCertainty | undefined })} options={CERTAINTY_ORDER.map((c) => ({ value: c, label: CERTAINTY_META[c].label, cls: CERTAINTY_META[c].cls }))} />
      </div>

      <div>
        <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Reserva</div>
        <Chips label="Reserva" value={draft.booking} onPick={(v) => onBooking(v as TripBooking | undefined)} options={BOOKING_ORDER.map((b) => ({ value: b, label: BOOKING_META[b].label }))} />
        {draft.optional && (draft.booking === 'concluido' || status === 'feito') && <p className="text-[12px] text-muted mt-1.5 px-0.5">Extra marcado como feito — só se você confirmou que rolou.</p>}
      </div>

      {status === 'cancelado' && (
        <div>
          <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Cancelado por</div>
          <Chips label="Motivo do cancelamento" value={draft.cancelReason} onPick={(v) => set({ cancelReason: v })} options={(['vento', 'chuva', 'mar', 'outro'] as const).map((r) => ({ value: r, label: CANCEL_REASON_LABEL[r] }))} />
          <p className="text-[12px] text-muted mt-1.5 px-0.5">Vento, chuva ou mar: o dia mostra trocas que cabem. Nada muda sozinho.</p>
        </div>
      )}

      <MoreOptions label="horários e deslocamento" defaultOpen={has('endTime', 'wakeTime', 'prepTime', 'leaveTime', 'returnTime', 'address', 'route', 'travelMinutes')}>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Termina">
            <TimeInput value={draft.endTime} onChange={(v) => set({ endTime: v })} />
          </Field>
          <Field label="Despertar">
            <TimeInput value={draft.wakeTime} onChange={(v) => set({ wakeTime: v })} />
          </Field>
          <Field label="Preparo">
            <TimeInput value={draft.prepTime} onChange={(v) => set({ prepTime: v })} />
          </Field>
          <Field label="Saída">
            <TimeInput value={draft.leaveTime} onChange={(v) => set({ leaveTime: v })} />
          </Field>
          <Field label="Volta">
            <TimeInput value={draft.returnTime} onChange={(v) => set({ returnTime: v })} />
          </Field>
          <Field label="Deslocamento (min)">
            <NumberInput value={draft.travelMinutes} onChange={(v) => set({ travelMinutes: v })} />
          </Field>
        </div>
        <Field label="Endereço">
          <TextInput placeholder="Onde é" value={draft.address ?? ''} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <MapLinks trip={trip} address={draft.address?.trim() || undefined} />
        <Field label="Rota / transporte">
          <TextInput placeholder="Uber, transfer do operador, a pé…" value={draft.route ?? ''} onChange={(e) => set({ route: e.target.value })} />
        </Field>
      </MoreOptions>

      <MoreOptions label="custos" defaultOpen={has('estimatedCents', 'quotedCents', 'paidCents', 'uberCents')}>
        <Field label="Moeda">
          <Select value={cur} onChange={(v) => set({ currency: v })} options={[{ value: 'ZAR', label: 'Rand (ZAR)' }, { value: 'BRL', label: 'Real (BRL)' }]} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Estimado">
            <CentsInput label="Estimado" currency={cur} value={draft.estimatedCents} onChange={(v) => set({ estimatedCents: v })} />
          </Field>
          <Field label="Cotado">
            <CentsInput label="Cotado" currency={cur} value={draft.quotedCents} onChange={(v) => set({ quotedCents: v })} />
          </Field>
          <Field label="Pago">
            <CentsInput label="Pago" currency={cur} value={draft.paidCents} onChange={(v) => set({ paidCents: v })} />
          </Field>
          <Field label="Uber (à parte)">
            <CentsInput label="Uber" currency={cur} value={draft.uberCents} onChange={(v) => set({ uberCents: v })} />
          </Field>
        </div>
      </MoreOptions>

      <MoreOptions label="fornecedor, voucher e pickup" defaultOpen={has('supplier', 'contact', 'voucherUrl', 'cancellationPolicy', 'pickup', 'needsPickup')}>
        <Field label="Fornecedor">
          <TextInput value={draft.supplier ?? ''} onChange={(e) => set({ supplier: e.target.value })} />
        </Field>
        <Field label="Contato">
          <TextInput inputMode="tel" placeholder="Telefone, WhatsApp, e-mail" value={draft.contact ?? ''} onChange={(e) => set({ contact: e.target.value })} />
        </Field>
        <Field label="Voucher / comprovante (link)">
          <TextInput inputMode="url" placeholder="https://…" value={draft.voucherUrl ?? ''} onChange={(e) => set({ voucherUrl: e.target.value })} />
        </Field>
        <Field label="Política de cancelamento">
          <TextArea rows={2} value={draft.cancellationPolicy ?? ''} onChange={(e) => set({ cancellationPolicy: e.target.value })} />
        </Field>
        <Toggle checked={draft.needsPickup} onChange={(v) => set({ needsPickup: v || undefined })}>
          Tem pickup
        </Toggle>
        {draft.needsPickup && (
          <>
            <Field label="Pickup (ponto e horário)">
              <TextInput value={draft.pickup ?? ''} onChange={(e) => set({ pickup: e.target.value })} />
            </Field>
            <Toggle checked={draft.pickupConfirmed} onChange={(v) => set({ pickupConfirmed: v })}>
              Pickup confirmado pelo fornecedor
            </Toggle>
          </>
        )}
      </MoreOptions>

      <MoreOptions label="preparo e segurança" defaultOpen={has('outfit', 'checklistKind', 'risk', 'planB', 'clearance', 'volunteer')}>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Checklist">
            <Select<TripChecklistKind> value={draft.checklistKind} placeholder="Nenhum" onChange={(v) => set({ checklistKind: v })} options={(Object.keys(CHECKLIST_LABEL) as TripChecklistKind[]).map((k) => ({ value: k, label: `${CHECKLIST_LABEL[k].emoji} ${CHECKLIST_LABEL[k].label}` }))} />
          </Field>
          <Field label="Liberação médica">
            <Select value={draft.clearance} placeholder="Não precisa" onChange={(v) => set({ clearance: v })} options={[{ value: 'pendente', label: 'Pendente' }, { value: 'liberada', label: 'Liberada' }, { value: 'nao_liberada', label: 'Não liberada' }]} />
          </Field>
        </div>
        <Field label="Roupa">
          <TextInput value={draft.outfit ?? ''} onChange={(e) => set({ outfit: e.target.value })} />
        </Field>
        <Field label="Risco">
          <TextInput value={draft.risk ?? ''} onChange={(e) => set({ risk: e.target.value })} />
        </Field>
        <Field label="Plano B">
          <TextInput value={draft.planB ?? ''} onChange={(e) => set({ planB: e.target.value })} />
        </Field>
        {draft.checklistKind === 'voluntariado' && (
          <Field label="Tipo">
            <Select value={draft.volunteer} placeholder="A definir" onChange={(v) => set({ volunteer: v })} options={[{ value: 'visita_educativa', label: 'Visita educativa' }, { value: 'voluntariado', label: 'Trabalho voluntário' }]} />
          </Field>
        )}
      </MoreOptions>

      <MoreOptions label="escola e extras" defaultOpen={has('schoolImpact', 'optional', 'opportunityCost')}>
        <div>
          <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Impacto na escola</div>
          <Chips label="Impacto na escola" value={draft.schoolImpact} onPick={(v) => set({ schoolImpact: v })} options={[{ value: 'parcial', label: 'Perde parte da aula' }, { value: 'dia', label: 'Sem aula no dia' }]} />
        </div>
        {draft.schoolImpact && (
          <Toggle checked={draft.schoolMadeUp} onChange={(v) => set({ schoolMadeUp: v })}>
            Aula reposta
          </Toggle>
        )}
        <Toggle checked={draft.optional} onChange={(v) => set({ optional: v })}>
          Extra (fora do roteiro base)
        </Toggle>
        <Toggle checked={draft.flexible} onChange={(v) => set({ flexible: v })}>
          Pode mudar de dia
        </Toggle>
        <Toggle checked={draft.indoor} onChange={(v) => set({ indoor: v })}>
          Lugar coberto (bom para chuva)
        </Toggle>
        {draft.optional && (
          <Field label="Custo de oportunidade">
            <TextArea rows={2} placeholder="O que deixa de fazer para caber" value={draft.opportunityCost ?? ''} onChange={(e) => set({ opportunityCost: e.target.value })} />
          </Field>
        )}
      </MoreOptions>
    </div>
  )
}
