import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Archive, ArrowUpRight, Sparkles, Undo2 } from 'lucide-react'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { Button, Chip, DateInput, EmptyState, Field, Pill, SheetLayout, TextInput } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { BrainDumpTarget, ID } from '@/data/types'
import { addDays, todayKey } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { normalize } from '@/lib/text'
import { applyConversion, CONVERTED_LABEL, TARGETS, targetMeta } from './triage'
import { openCreated } from './open'
import { applyIntent, INTENT_DONE, suggestionFor } from './nl'

const NEW_TRIP = '__new__'

export default function BrainDumpTriageSheet({ id }: SheetProps<'brainDumpTriage'>) {
  const db = useDB()
  const item = useMemo(() => db.brainDump.find((b) => b.id === id), [db.brainDump, id])
  const allTrips = db.trips
  const today = todayKey()
  // Parsed once from the captured text: a suggestion, never a decision.
  const [intent] = useState(() => (item ? suggestionFor(db, item.text, today) : undefined))
  const trips = useMemo(() => allTrips.filter((t) => t.status !== 'concluida').sort((a, b) => a.order - b.order), [allTrips])

  const [text, setText] = useState(item?.text ?? '')
  const [pending, setPending] = useState<BrainDumpTarget | undefined>()
  const [date, setDate] = useState<string | undefined>(intent?.fields.date ?? addDays(today, 1))
  const [who, setWho] = useState(intent?.fields.who ?? '')
  const [tripId, setTripId] = useState<ID>(() => {
    if (intent?.fields.tripId) return intent.fields.tripId
    const hay = normalize(`${item?.group ?? ''} ${item?.text ?? ''}`)
    const match = trips.find((t) => hay.includes(normalize(t.name)) || (t.place && hay.includes(normalize(t.place))))
    return match?.id ?? trips[0]?.id ?? NEW_TRIP
  })

  if (!item) {
    return (
      <SheetLayout title="Inbox" onClose={closeSheet}>
        <EmptyState emoji="🌿" title="Esse item não existe mais" compact />
      </SheetLayout>
    )
  }

  const persistText = () => {
    const clean = text.trim()
    if (clean && clean !== item.text) actions.update('brainDump', item.id, { text: clean })
  }

  const convert = (target: BrainDumpTarget) => {
    persistText()
    const res = applyConversion(item.id, target, {
      today,
      date,
      who,
      tripId: target === 'trip' && tripId !== NEW_TRIP ? tripId : undefined,
    })
    if (!res) return
    haptic('success')
    toast(targetMeta(target).done, { action: { label: 'Abrir', run: () => openCreated(res.type, res.id) } })
    closeSheet()
  }

  const pick = (target: BrainDumpTarget) => {
    const meta = targetMeta(target)
    if (meta.needs) {
      setPending(pending === target ? undefined : target)
      return
    }
    convert(target)
  }

  const archive = () => {
    persistText()
    actions.update('brainDump', item.id, { status: 'arquivado' })
    toast('Arquivado', { action: { label: 'Desfazer', run: () => actions.update('brainDump', item.id, { status: 'inbox' }) } })
    closeSheet()
  }

  const acceptIntent = () => {
    if (!intent) return
    persistText()
    const res = applyIntent(item.id, intent, today)
    if (!res) return
    haptic('success')
    toast(INTENT_DONE[intent.type], { action: { label: 'Abrir', run: () => openCreated(res.type, res.id) } })
    closeSheet()
  }

  const processed = item.status !== 'inbox'
  const pendingMeta = pending ? targetMeta(pending) : undefined

  return (
    <SheetLayout
      eyebrow={item.group ? `Inbox · ${item.group}` : 'Inbox'}
      title={processed ? 'Já organizado' : 'O que isso vira?'}
      onClose={closeSheet}
      onDelete={() => {
        removeWithUndo('brainDump', item.id, 'Apagado da inbox')
        closeSheet()
      }}
      primary={
        pendingMeta && !processed
          ? {
              label: `Virar ${pendingMeta.label.toLowerCase()}`,
              onClick: () => convert(pendingMeta.target),
              disabled: pending === 'reminder' && !date,
            }
          : undefined
      }
      footerExtra={
        !processed ? (
          <Button variant="soft" size="md" icon={<Archive size={16} />} onClick={archive} className={cn(!pendingMeta && 'flex-1')}>
            Arquivar
          </Button>
        ) : undefined
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={persistText}
        rows={Math.min(5, Math.max(2, text.split('\n').length))}
        className="w-full bg-surface-2 rounded-2xl px-4 py-3 outline-none resize-none font-display text-[19px] leading-snug border border-transparent focus:border-accent/40"
      />

      {processed ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Pill className="bg-sage-soft text-sage">
              {item.status === 'arquivado' ? 'arquivado' : (item.convertedTo && CONVERTED_LABEL[item.convertedTo.type]) ?? 'processado'} ✓
            </Pill>
          </div>
          <div className="flex gap-2">
            {item.convertedTo && (
              <Button
                variant="soft"
                icon={<ArrowUpRight size={16} />}
                onClick={() => {
                  if (openCreated(item.convertedTo!.type, item.convertedTo!.id)) closeSheet()
                }}
              >
                Abrir
              </Button>
            )}
            <Button
              variant="ghost"
              icon={<Undo2 size={16} />}
              onClick={() => {
                actions.update('brainDump', item.id, { status: 'inbox', convertedTo: undefined })
                toast('De volta pra inbox')
              }}
            >
              Voltar pra inbox
            </Button>
          </div>
        </div>
      ) : (
        <>
          {intent && (
            <div className="rounded-2xl bg-accent-soft p-3.5">
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                <Sparkles size={14} className="text-accent" /> Parece
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex-1 min-w-0 font-medium text-[15.5px] leading-snug">{intent.label}</span>
                <Button variant="primary" size="sm" onClick={acceptIntent}>
                  Criar
                </Button>
              </div>
              <p className="text-[12px] text-muted mt-1">Não é isso? Escolhe outro aqui embaixo.</p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {TARGETS.map((t, i) => (
              <motion.button
                key={t.target}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.015 }}
                onClick={() => pick(t.target)}
                aria-pressed={pending === t.target}
                className={cn(
                  'h-[72px] rounded-2xl flex flex-col items-center justify-center gap-1 transition active:scale-[0.97]',
                  pending === t.target ? 'bg-ink text-bg' : 'bg-surface-2 text-ink',
                  intent?.type === t.target && pending !== t.target && 'ring-2 ring-accent/50',
                )}
              >
                <span className="text-[20px] leading-none" aria-hidden>
                  {t.emoji}
                </span>
                <span className="text-[12.5px] font-medium">{t.label}</span>
              </motion.button>
            ))}
          </div>

          {pending === 'reminder' && (
            <Field label="Lembrar quando?">
              <div className="flex gap-2 mb-2">
                <Chip selected={date === today} onClick={() => setDate(today)}>
                  Hoje
                </Chip>
                <Chip selected={date === addDays(today, 1)} onClick={() => setDate(addDays(today, 1))}>
                  Amanhã
                </Chip>
                <Chip selected={date === addDays(today, 7)} onClick={() => setDate(addDays(today, 7))}>
                  Em 1 semana
                </Chip>
              </div>
              <DateInput value={date} onChange={setDate} />
            </Field>
          )}
          {pending === 'waiting' && (
            <Field label="Esperando quem?">
              <TextInput autoFocus value={who} onChange={(e) => setWho(e.target.value)} placeholder="nome da pessoa" onKeyDown={(e) => e.key === 'Enter' && convert('waiting')} />
            </Field>
          )}
          {pending === 'trip' && (
            <Field label="Em qual viagem?" hint="entra como “quero ir” · a confirmar">
              <div className="flex flex-wrap gap-2">
                {trips.map((t) => (
                  <Chip key={t.id} selected={tripId === t.id} onClick={() => setTripId(t.id)}>
                    {t.flag} {t.name}
                  </Chip>
                ))}
                <Chip selected={tripId === NEW_TRIP} onClick={() => setTripId(NEW_TRIP)}>
                  ✨ Nova viagem
                </Chip>
              </div>
            </Field>
          )}
          {!pending && <p className="text-[13px] text-muted px-0.5">Toque e pronto. Dá pra ajustar os detalhes depois.</p>}
        </>
      )}
    </SheetLayout>
  )
}
