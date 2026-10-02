import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, Pencil, Plus, Stethoscope, X } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { actions, useDB } from '@/data/store'
import type { Link, Pet, PetTaskCategory } from '@/data/types'
import { SEED_IDS } from '@/data/seed/ids'
import {
  Button,
  Card,
  Chip,
  DateInput,
  EmptyState,
  Field,
  IconButton,
  ListCard,
  ListRow,
  Page,
  PageHeader,
  SectionTitle,
  TextArea,
  TextInput,
} from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { formatBRL } from '@/lib/money'
import { formatFullDate, relativeDay } from '@/lib/date'
import { PetTaskRow } from './PetTaskRow'
import { LUNA_CATEGORY_ID, lunaExpensesThisMonth, lunaOf, lunaToday, petAge, petTasksByArea } from './selectors'

const fade = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.04 * i, duration: 0.3 },
})

export default function LunaPage() {
  const db = useDB()
  const today = useToday()
  const pet = useMemo(() => lunaOf(db), [db])
  const todayList = useMemo(() => lunaToday(db, today), [db, today])
  const areas = useMemo(() => petTasksByArea(db, today), [db, today])
  const spend = useMemo(() => lunaExpensesThisMonth(db, today), [db, today])
  const name = pet?.name ?? 'Luna'
  const pending = todayList.filter((s) => !s.doneToday).length
  const [area, setArea] = useState<PetTaskCategory | undefined>()

  return (
    <Page>
      <PageHeader
        back
        backTo={ROUTES.life}
        eyebrow="Vida"
        title={`${name} 🐾`}
        subtitle={
          todayList.length === 0
            ? 'nada pra hoje — só carinho'
            : pending === 0
              ? 'tudo feito hoje. boa! 💛'
              : `${pending} ${pending === 1 ? 'coisinha' : 'coisinhas'} pra hoje`
        }
        actions={
          <IconButton label="Novo cuidado" onClick={() => openSheet('petTask')}>
            <Plus size={22} />
          </IconButton>
        }
      />

      <motion.div {...fade(0)}>
        <ProfileCard pet={pet} today={today} />
      </motion.div>

      <SectionTitle>Hoje</SectionTitle>
      <motion.div {...fade(1)}>
        {todayList.length ? (
          <ListCard>
            {todayList.map((s) => (
              <PetTaskRow key={s.task.id} state={s} today={today} />
            ))}
          </ListCard>
        ) : (
          <Card>
            <EmptyState compact emoji="🐕" title="Dia livre" text="Nenhum cuidado marcado pra hoje. Um passeio extra nunca é demais." />
          </Card>
        )}
      </motion.div>

      <SectionTitle action={<SectionAction label="cuidado" onClick={() => openSheet('petTask')} />}>Cuidados</SectionTitle>
      {areas.length ? (
        <>
          {areas.length > 1 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-3">
              <Chip selected={!area} onClick={() => setArea(undefined)}>
                Todos
              </Chip>
              {areas.map((a) => (
                <Chip key={a.value} selected={area === a.value} onClick={() => setArea(area === a.value ? undefined : a.value)}>
                  <span aria-hidden>{a.emoji}</span>
                  {a.label}
                </Chip>
              ))}
            </div>
          )}
          <motion.div {...fade(2)}>
            <ListCard>
              {areas
                .filter((a) => !area || a.value === area)
                .flatMap((a) => a.items)
                .map((s) => (
                  <PetTaskRow key={s.task.id} state={s} today={today} />
                ))}
            </ListCard>
          </motion.div>
        </>
      ) : (
        <Card>
          <EmptyState
            compact
            emoji="🦴"
            title="Nenhum cuidado ainda"
            text="Banho, ração, vermífugo… anota uma vez e o app lembra por você."
            action={<Button size="sm" onClick={() => openSheet('petTask')}>Adicionar cuidado</Button>}
          />
        </Card>
      )}

      <SectionTitle action={<SectionAction label="gasto" onClick={() => openSheet('expense', { defaults: { categoryId: LUNA_CATEGORY_ID } })} />}>
        Gastos da {name} · este mês
      </SectionTitle>
      <motion.div {...fade(3)}>
        <div className="card overflow-hidden">
          <div className="px-4 pt-4 pb-3 flex items-baseline justify-between">
            <span className="font-display text-[28px] leading-none tracking-tight">{formatBRL(spend.total)}</span>
            <span className="text-[13px] text-muted">
              {spend.list.length === 0 ? 'nada registrado' : `${spend.list.length} ${spend.list.length === 1 ? 'gasto' : 'gastos'}`}
            </span>
          </div>
          {spend.list.length > 0 && (
            <div className="divide-y divide-line/70 border-t border-line/70">
              {spend.list.slice(0, 6).map((e) => (
                <ListRow
                  key={e.id}
                  title={e.title}
                  subtitle={relativeDay(e.date!, today)}
                  trailing={<span className="text-ink font-medium tabular-nums">{formatBRL(e.amountCents)}</span>}
                  onPress={() => openSheet('expense', { id: e.id })}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </Page>
  )
}

// ─── Profile card (inline edit) ─────────────────────────────────────────────

interface Draft {
  name: string
  breed: string
  birthDate?: string
  vetName: string
  vetContact: string
  notes: string
  documents: Link[]
}

function toDraft(p: Pet | undefined): Draft {
  return {
    name: p?.name ?? 'Luna',
    breed: p?.breed ?? '',
    birthDate: p?.birthDate,
    vetName: p?.vet?.name ?? '',
    vetContact: p?.vet?.contact ?? '',
    notes: p?.notes ?? '',
    documents: p?.documents ?? [],
  }
}

function ProfileCard({ pet, today }: { pet: Pet | undefined; today: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => toDraft(pet))
  const [docLabel, setDocLabel] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const age = petAge(pet?.birthDate, today)

  const open = () => {
    setDraft(toDraft(pet))
    setEditing(true)
  }

  const addDoc = () => {
    const url = docUrl.trim()
    if (!url) return
    const full = /^https?:\/\//i.test(url) ? url : `https://${url}`
    setDraft((d) => ({ ...d, documents: [...d.documents, { label: docLabel.trim() || 'Documento', url: full }] }))
    setDocLabel('')
    setDocUrl('')
  }

  const save = () => {
    const pendingDoc = docUrl.trim()
      ? [{ label: docLabel.trim() || 'Documento', url: /^https?:\/\//i.test(docUrl.trim()) ? docUrl.trim() : `https://${docUrl.trim()}` }]
      : []
    const data = {
      name: draft.name.trim() || 'Luna',
      breed: draft.breed.trim() || undefined,
      birthDate: draft.birthDate,
      vet: draft.vetName.trim() || draft.vetContact.trim() ? { name: draft.vetName.trim(), contact: draft.vetContact.trim() || undefined } : undefined,
      notes: draft.notes.trim() || undefined,
      documents: [...draft.documents, ...pendingDoc],
    }
    if (pet) actions.update('pets', pet.id, data)
    else actions.create('pets', { id: SEED_IDS.petLuna, species: 'cachorro', ...data })
    setDocLabel('')
    setDocUrl('')
    setEditing(false)
    toast('Perfil salvo 🐾')
  }

  const meta = [pet?.breed ?? 'Border Collie', age].filter(Boolean).join(' · ')

  return (
    <div className="card overflow-hidden">
      <div className="p-4 flex items-start gap-4">
        <div className="h-16 w-16 rounded-full bg-sand-soft flex items-center justify-center text-[34px] shrink-0" aria-hidden>
          🐕
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="font-display text-[24px] leading-tight">{pet?.name ?? 'Luna'}</div>
          <div className="text-[14px] text-ink-2 mt-0.5">{meta}</div>
          {pet?.birthDate && <div className="text-[12.5px] text-muted mt-0.5">nasceu em {formatFullDate(pet.birthDate)}</div>}
        </div>
        <IconButton label={editing ? 'Fechar edição' : 'Editar perfil'} variant="soft" size="sm" onClick={() => (editing ? setEditing(false) : open())}>
          {editing ? <X size={16} /> : <Pencil size={15} />}
        </IconButton>
      </div>

      {!editing && (
        <div className="px-4 pb-4 space-y-2.5">
          {pet?.vet?.name || pet?.vet?.contact ? (
            <div className="flex items-center gap-2.5 text-[14px]">
              <Stethoscope size={16} className="text-sage shrink-0" />
              <span className="min-w-0 truncate">
                {pet.vet.name}
                {pet.vet.contact && <ContactLink contact={pet.vet.contact} withSep={!!pet.vet.name} />}
              </span>
            </div>
          ) : (
            <button type="button" onClick={open} className="flex items-center gap-2.5 text-[14px] text-muted min-h-9">
              <Stethoscope size={16} className="shrink-0" />
              adicionar contato da vet
            </button>
          )}
          {pet?.notes && <p className="text-[14px] text-ink-2 leading-relaxed whitespace-pre-line">{pet.notes}</p>}
          {!!pet?.documents.length && (
            <div className="flex flex-wrap gap-2 pt-0.5">
              {pet.documents.map((d, i) => (
                <a
                  key={i}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-surface-2 text-[13px] text-ink-2 active:bg-line"
                >
                  📄 {d.label}
                  <ExternalLink size={13} className="text-muted" />
                </a>
              ))}
            </div>
          )}
          {!pet?.birthDate && !pet?.notes && !pet?.documents.length && (
            <p className="text-[13px] text-muted">
              Aniversário, carteirinha de vacina, observações… <button type="button" className="underline underline-offset-2" onClick={open}>completar perfil</button>
            </p>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-4 border-t border-line/70">
              <div className="grid grid-cols-2 gap-3 pt-3">
                <Field label="Nome">
                  <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </Field>
                <Field label="Raça">
                  <TextInput value={draft.breed} onChange={(e) => setDraft({ ...draft, breed: e.target.value })} />
                </Field>
              </div>
              <Field label="Nascimento" hint={draft.birthDate ? petAge(draft.birthDate, today) : 'se não souber o dia, coloca um aproximado'}>
                <DateInput value={draft.birthDate} onChange={(v) => setDraft({ ...draft, birthDate: v })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Veterinária">
                  <TextInput placeholder="nome / clínica" value={draft.vetName} onChange={(e) => setDraft({ ...draft, vetName: e.target.value })} />
                </Field>
                <Field label="Contato">
                  <TextInput
                    placeholder="telefone"
                    inputMode="tel"
                    value={draft.vetContact}
                    onChange={(e) => setDraft({ ...draft, vetContact: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Notas">
                <TextArea
                  placeholder="alergias, manias, o que ela ama…"
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </Field>
              <div>
                <span className="block text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Documentos (links)</span>
                {draft.documents.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {draft.documents.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-xl bg-surface-2 pl-3 pr-1 min-h-11">
                        <span className="flex-1 min-w-0 truncate text-[14px]">📄 {d.label}</span>
                        <IconButton
                          label={`Remover ${d.label}`}
                          size="sm"
                          onClick={() => setDraft({ ...draft, documents: draft.documents.filter((_, j) => j !== i) })}
                        >
                          <X size={15} />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <TextInput className="w-[38%]" placeholder="nome" value={docLabel} onChange={(e) => setDocLabel(e.target.value)} />
                  <TextInput
                    className="flex-1 min-w-0"
                    placeholder="link (Drive, PDF…)"
                    inputMode="url"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addDoc()}
                  />
                  <IconButton label="Adicionar documento" variant="soft" onClick={addDoc}>
                    <Plus size={18} />
                  </IconButton>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={save}>
                  Salvar perfil
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ContactLink({ contact, withSep }: { contact: string; withSep: boolean }) {
  const digits = contact.replace(/\D/g, '')
  const href = /^https?:\/\//i.test(contact) ? contact : digits.length >= 8 ? `tel:${digits}` : undefined
  return (
    <>
      {withSep && <span className="text-muted"> · </span>}
      {href ? (
        <a href={href} className="text-ocean underline-offset-2 active:underline">
          {contact}
        </a>
      ) : (
        <span className="text-ink-2">{contact}</span>
      )}
    </>
  )
}

function SectionAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-my-2 h-9 px-2 -mr-1 inline-flex items-center gap-1 text-[13px] text-ink-2 rounded-full active:bg-surface-2">
      <Plus size={14} />
      {label}
    </button>
  )
}
