/** Executive Career Review — her six questions, drafted from what's already recorded; she edits and saves. */
import { useMemo, useState } from 'react'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { useDB } from '@/data/store'
import { REVIEW_QUESTIONS, careerReviews, reviewDraft, saveCareerReview, savedReview, type CareerAnswers } from '@/data/career/review'
import { Button, Card, Field, Page, PageHeader, SectionTitle, TextArea, TextInput } from '@/components/ui'
import { LockGate } from '@/components/layout/LockGate'
import { useToday } from '@/hooks/useToday'
import { monthKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const label = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`

export default function CareerReviewPageGuarded() {
  return (
    <LockGate area="carreira">
      <CareerReviewPage />
    </LockGate>
  )
}

function CareerReviewPage() {
  const db = useDB()
  const today = useToday()
  const month = monthKey(today)
  const saved = savedReview(db, month)
  const draft = useMemo(() => reviewDraft(db, month, today), [db, month, today])
  const [answers, setAnswers] = useState<CareerAnswers>(() => ({ ...draft, ...(saved?.career ?? {}) }))
  const [prios, setPrios] = useState<string[]>(() => [...(saved?.career?.priorities ?? []), '', '', ''].slice(0, 3))
  const history = careerReviews(db).filter((r) => r.month !== month)

  const save = () => {
    const undo = saveCareerReview(month, { ...answers, priorities: prios })
    haptic('success')
    toast('Revisão salva ✓', { action: { label: 'Desfazer', run: undo } })
  }

  return (
    <Page>
      <PageHeader title="Executive Career Review" back backTo={ROUTES.career} subtitle={label(month)} />
      <p className="text-[13px] text-muted px-1 -mt-2 mb-3">Rascunho montado com o que já está registrado. Ajusta o que quiser — sem nota, sem porcentagem.</p>
      <Card className="p-4 space-y-4">
        {REVIEW_QUESTIONS.map((q) => (
          <Field key={q.key} label={q.label}>
            <TextArea rows={3} value={answers[q.key] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} placeholder="nada registrado — escreve se quiser" />
          </Field>
        ))}
        <Field label="Três prioridades do próximo mês">
          <div className="space-y-2">
            {prios.map((p, i) => (
              <TextInput key={i} value={p} onChange={(e) => setPrios(prios.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`${i + 1}.`} />
            ))}
          </div>
        </Field>
        <Button variant="primary" block onClick={save}>
          {saved?.completedAt ? 'Atualizar revisão' : 'Salvar revisão'}
        </Button>
      </Card>

      {history.length > 0 && (
        <>
          <SectionTitle>Revisões anteriores</SectionTitle>
          <Card className="p-4">
            {history.map((r) => (
              <details key={r.id} className="py-2 border-b border-line/70 last:border-0">
                <summary className="text-[14.5px] first-letter:uppercase cursor-pointer">{label(r.month)}</summary>
                <div className="mt-2 space-y-2 text-[13.5px] text-ink-2 whitespace-pre-line">
                  {REVIEW_QUESTIONS.map((q) => (r.career?.[q.key] ? <p key={q.key}><span className="text-muted">{q.label}</span>{'\n'}{r.career[q.key]}</p> : null))}
                  {r.career?.priorities?.length ? <p><span className="text-muted">Prioridades</span>{'\n'}{r.career.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}</p> : null}
                </div>
              </details>
            ))}
          </Card>
        </>
      )}
    </Page>
  )
}
