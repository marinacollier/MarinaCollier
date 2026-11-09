import { useMemo, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { Button, Card, ChipSelect, EmptyState, Field, Pill, SectionTitle, SheetLayout, TextArea, TextInput } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { LearningError, NewItem, ReviewCardStatus } from '@/data/types'
import { useToday } from '@/hooks/useToday'
import { formatDayMonth } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { errorTopicsFrom, ERRORS_ITEM_ID } from '../engine/import'
import { domainLabel, domainsOf, LANG_DOMAIN, languageTracks, planOf, trackName } from '../engine/model'
import { dueCards, DEFAULT_MAX_REVIEWS, newCardFields, review } from '../engine/srs'
import { LocalSheet } from './LocalSheet'

export const CARD_STATUS_LABEL: Record<ReviewCardStatus, string> = {
  novo: 'novo',
  em_pratica: 'em prática',
  consolidando: 'consolidando',
  dominado_provisorio: 'dominado (provisório)',
  revisar: 'revisar',
}

/** Review flow (mostrar resposta → acertei/errei), the card list, new cards and the one-tap topic import. */
export function ReviewPanel() {
  const db = useDB()
  const today = useToday()
  const cards = useMemo(() => db.learningErrors ?? [], [db.learningErrors])
  const cap = planOf(db).maxReviewsPerDay ?? DEFAULT_MAX_REVIEWS
  const due = useMemo(() => dueCards(cards, today, cap), [cards, today, cap])
  const [shown, setShown] = useState(false)
  const [adding, setAdding] = useState(false)
  const current = due[0]
  const topicsItem = db.studyItems.find((i) => i.id === ERRORS_ITEM_ID)
  const pendingTopics = useMemo(() => (topicsItem ? errorTopicsFrom(db, topicsItem, today) : []), [db, topicsItem, today])

  const answer = (c: LearningError, correct: boolean) => {
    const before = { status: c.status, nextReview: c.nextReview, intervalDays: c.intervalDays, ease: c.ease, streak: c.streak, lastReviewed: c.lastReviewed }
    const patch = review(c, correct, today)
    actions.update('learningErrors', c.id, patch)
    setShown(false)
    haptic(correct ? 'success' : 'light')
    toast(correct ? `Próxima revisão ${formatDayMonth(patch.nextReview)}` : 'Volta amanhã — tudo bem errar', { action: { label: 'Desfazer', run: () => actions.update('learningErrors', c.id, before) } })
  }

  const importTopics = () => {
    const made = actions.createMany('learningErrors', pendingTopics)
    haptic('success')
    toast(`${made.length} erros importados ✓`, { action: { label: 'Desfazer', run: () => made.forEach((m) => actions.remove('learningErrors', m.id)) } })
  }

  return (
    <div className="space-y-4">
      {current ? (
        <Card aria-label="Revisão" className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="eyebrow">
              {due.length} para hoje · {current.kind === 'conceito' ? 'conceito' : 'erro'} · {current.trackId ? trackName(db, current.trackId) : domainLabel(db, current.domain ?? LANG_DOMAIN)}
            </span>
            <Pill>{CARD_STATUS_LABEL[current.status]}</Pill>
          </div>
          <div className="font-display text-[22px] leading-tight">{current.front}</div>
          {shown ? (
            <>
              <div className="text-[16px]">{current.back}</div>
              {current.explanation && <p className="text-[13.5px] text-muted">{current.explanation}</p>}
              <div className="flex gap-2">
                <Button variant="primary" icon={<Check size={16} />} onClick={() => answer(current, true)}>
                  Acertei
                </Button>
                <Button variant="soft" icon={<X size={16} />} onClick={() => answer(current, false)}>
                  Errei
                </Button>
              </div>
            </>
          ) : (
            <Button variant="soft" onClick={() => setShown(true)}>
              Mostrar correção
            </Button>
          )}
        </Card>
      ) : (
        <EmptyState compact emoji="🌿" title="Nada para revisar hoje" text={cards.length ? 'As próximas revisões aparecem no dia certo.' : 'Adicione só o que você quer memorizar — reflexões não viram cartões sozinhas.'} />
      )}

      {pendingTopics.length > 0 && topicsItem && (
        <Card className="flex items-center justify-between gap-3">
          <div className="text-[14px]">
            {pendingTopics.length} tópicos em “{topicsItem.title}” ainda não são cartões.
          </div>
          <Button size="sm" variant="soft" onClick={importTopics}>
            Importar como erros
          </Button>
        </Card>
      )}

      <SectionTitle
        action={
          <button type="button" onClick={() => setAdding(true)} className="text-[13px] text-muted h-8 -mb-1.5 px-1 inline-flex items-center gap-1">
            <Plus size={14} /> novo cartão
          </button>
        }
      >
        Cartões ({cards.length})
      </SectionTitle>
      <div className="space-y-2">
        {[...cards]
          .sort((a, b) => a.nextReview.localeCompare(b.nextReview))
          .map((c) => (
            <div key={c.id} className="rounded-2xl bg-surface p-3.5 border border-line flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14.5px] truncate">{c.front}</div>
                <div className="text-[13px] text-muted truncate">→ {c.back}</div>
                <div className="text-[12px] text-muted mt-0.5">
                  {CARD_STATUS_LABEL[c.status]} · {c.count}× · revisar {formatDayMonth(c.nextReview)}
                </div>
              </div>
              <button type="button" className="text-[12px] text-muted shrink-0" onClick={() => removeWithUndo('learningErrors', c.id, 'Cartão apagado')}>
                apagar
              </button>
            </div>
          ))}
      </div>
      <LocalSheet open={adding} onClose={() => setAdding(false)}>
        <NewCard onClose={() => setAdding(false)} />
      </LocalSheet>
    </div>
  )
}

function NewCard({ onClose }: { onClose: () => void }) {
  const db = useDB()
  const today = useToday()
  const [kind, setKind] = useState<'erro' | 'conceito'>('erro')
  const [domain, setDomain] = useState<string>(LANG_DOMAIN)
  const [trackId, setTrackId] = useState<string | undefined>(languageTracks(db)[0])
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [explanation, setExplanation] = useState('')
  const [category, setCategory] = useState('')
  const ok = front.trim() && back.trim()
  const save = () => {
    if (!ok) return
    const c: NewItem<'learningErrors'> = { ...newCardFields(today), kind, domain, front: front.trim(), back: back.trim(), source: 'app' }
    if (domain === LANG_DOMAIN && trackId) c.trackId = trackId
    if (explanation.trim()) c.explanation = explanation.trim()
    if (category.trim()) c.category = category.trim()
    actions.create('learningErrors', c)
    haptic('success')
    onClose()
  }
  return (
    <SheetLayout title="Novo cartão" eyebrow="revisão espaçada" onClose={onClose} primary={{ label: 'Salvar', onClick: save, disabled: !ok }}>
      <div className="space-y-4">
        <ChipSelect value={kind} onChange={(v) => v && setKind(v)} options={[{ value: 'erro', label: 'Erro' }, { value: 'conceito', label: 'Conceito' }]} />
        <Field label="Área">
          <ChipSelect value={domain} onChange={(v) => v && setDomain(v)} options={domainsOf(db).map((d) => ({ value: d.id, label: d.label }))} />
        </Field>
        {domain === LANG_DOMAIN && (
          <Field label="Idioma">
            <ChipSelect value={trackId} onChange={setTrackId} options={languageTracks(db).map((t) => ({ value: t, label: trackName(db, t) }))} />
          </Field>
        )}
        <Field label={kind === 'erro' ? 'O que eu disse / escrevi' : 'Pergunta'}>
          <TextInput value={front} onChange={(e) => setFront(e.target.value)} />
        </Field>
        <Field label={kind === 'erro' ? 'Correção' : 'Resposta'}>
          <TextInput value={back} onChange={(e) => setBack(e.target.value)} />
        </Field>
        <Field label="Explicação (opcional)">
          <TextArea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} />
        </Field>
        <Field label="Categoria (opcional)">
          <TextInput value={category} onChange={(e) => setCategory(e.target.value)} placeholder="preposições, patrística…" />
        </Field>
      </div>
    </SheetLayout>
  )
}
