/**
 * One study: reference, mark done (her choice — opening this page or generating a study never marks it),
 * the guided study (Estudar com IA, when the server is connected) and her notebook (edit / see earlier entries).
 * Completed studies can be revisited and unchecked; nothing she wrote is lost.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { Button, Card, EmptyState, Field, Page, PageHeader, SectionTitle, TextArea, TextInput } from '@/components/ui'
import { persist, useDB } from '@/data/store'
import { journalFor, latestStudy, sessionsOf } from '@/data/spiritual/model'
import { isEmptyJournal, saveJournal, type JournalFields } from '@/data/spiritual/ops'
import type { SpiritualJournalEntry, SpiritualSession, SpiritualStudy } from '@/data/types'
import { useAuth } from '@/integrations/auth'
import { formatShortDate, toDateKey } from '@/lib/date'
import { AVAILABILITY_TEXT, generateStudy, STUDY_SECTIONS, studyAvailability } from './study'
import { checkSession, doneLabel, Prose } from './parts'

export default function SessionPage() {
  const { id = '' } = useParams()
  const db = useDB()
  const nav = useNavigate()
  const s = db.spiritualSessions.find((x) => x.id === id)
  const plan = s ? db.spiritualPlans.find((p) => p.id === s.planId) : undefined
  const siblings = useMemo(() => (s ? sessionsOf(db, s.planId) : []), [db, s])
  const entries = useMemo(() => (s ? journalFor(db, s.id) : []), [db, s])
  const study = useMemo(() => (s ? latestStudy(db, s.id) : undefined), [db, s])
  if (!s)
    return (
      <Page>
        <PageHeader title="Estudo" back backTo={ROUTES.bible} />
        <EmptyState emoji="🕊️" title="Estudo não encontrado" />
      </Page>
    )
  const i = siblings.findIndex((x) => x.id === s.id)
  const prev = siblings[i - 1]
  const next = siblings[i + 1]
  const done = s.status === 'concluido'

  return (
    <Page>
      <PageHeader title={s.scriptureReference} eyebrow={plan?.title} subtitle={s.title} back backTo={plan ? ROUTES.biblePlan(plan.id) : ROUTES.bible} />

      <Card className="flex items-center justify-between gap-3">
        <div className="text-[14px] text-ink-2">{done ? doneLabel(s) : s.status === 'em_andamento' ? 'Em andamento' : 'Ainda não estudado'} · ~{s.estimatedMinutes} min</div>
        <Button variant={done ? 'outline' : 'primary'} size="sm" onClick={() => checkSession(s, !done)}>
          {done ? 'Desmarcar' : 'Marcar como concluído'}
        </Button>
      </Card>

      <StudySection key={`study-${s.id}`} s={s} planTitle={plan?.title} study={study} />

      <SectionTitle>Caderno</SectionTitle>
      <JournalForm key={`new-${s.id}-${entries.length}`} s={s} />
      {entries.length > 0 && (
        <>
          <SectionTitle>{entries.length === 1 ? 'Reflexão anterior' : 'Reflexões anteriores'}</SectionTitle>
          <div className="grid gap-3">
            {entries.map((e) => (
              <JournalEntryCard key={e.id} s={s} e={e} />
            ))}
          </div>
        </>
      )}

      <nav className="flex justify-between gap-3 mt-8">
        {prev ? (
          <Button variant="ghost" size="sm" icon={<ChevronLeft size={16} />} onClick={() => nav(ROUTES.bibleSession(prev.id), { replace: true })}>
            {prev.scriptureReference}
          </Button>
        ) : (
          <span />
        )}
        {next && (
          <Button variant="ghost" size="sm" onClick={() => nav(ROUTES.bibleSession(next.id), { replace: true })}>
            {next.scriptureReference}
            <ChevronRight size={16} />
          </Button>
        )}
      </nav>
    </Page>
  )
}

function StudySection({ s, planTitle, study }: { s: SpiritualSession; planTitle?: string; study?: SpiritualStudy }) {
  const signedIn = useAuth((a) => a.signedIn)
  const availability = studyAvailability(signedIn)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [asking, setAsking] = useState(!study)

  const run = async () => {
    setBusy(true)
    setError(undefined)
    const r = await generateStudy(s, planTitle, notes)
    setBusy(false)
    if (!r.ok) return setError(r.message)
    void persist()
    setAsking(false)
    setNotes('')
    toast('Estudo salvo no seu caderno')
  }

  return (
    <>
      <SectionTitle>Estudo guiado</SectionTitle>
      {study && <StudyView study={study} />}
      {asking ? (
        <Card className={study ? 'mt-3' : undefined}>
          {availability === 'ready' ? (
            <>
              <Field label="Suas anotações (opcional)" hint="Notas da sua Bíblia de estudo ou uma transcrição. Fotos ainda não são aceitas — transcreva o trecho.">
                <TextArea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cole aqui o que quiser que o estudo considere" />
              </Field>
              <Button variant="primary" block className="mt-3" disabled={busy} onClick={() => void run()}>
                {busy ? 'Preparando o estudo…' : 'Estudar com IA'}
              </Button>
              {error && <p className="text-[13px] text-accent mt-2">{error}</p>}
              <p className="text-[12px] text-muted mt-2">Gerar o estudo não marca o capítulo como concluído.</p>
            </>
          ) : (
            <>
              <Button variant="soft" block disabled>
                Estudar com IA
              </Button>
              <p className="text-[13px] text-muted mt-2">{AVAILABILITY_TEXT[availability]}</p>
            </>
          )}
        </Card>
      ) : (
        <button type="button" className="text-[13px] text-muted h-10 px-1 mt-1" onClick={() => setAsking(true)}>
          Gerar outro estudo
        </button>
      )}
    </>
  )
}

function StudyView({ study }: { study: SpiritualStudy }) {
  const c = study.content
  return (
    <Card className="space-y-6">
      <div className="text-[12px] text-muted">Preparado pela Lumos em {formatShortDate(toDateKey(new Date(study.generatedAt)))}{study.userNotes ? ' · com suas anotações' : ''}</div>
      {STUDY_SECTIONS.map(({ key, label }) => (
        <section key={key}>
          <h3 className="eyebrow mb-2">{label}</h3>
          <Prose text={c[key]} />
        </section>
      ))}
      <section>
        <h3 className="eyebrow mb-2">Perguntas para o caderno</h3>
        <ol className="list-decimal pl-5 space-y-2 text-[16px] leading-[1.6] text-ink-2">
          {c.perguntas.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
      </section>
      <section>
        <h3 className="eyebrow mb-2">Oração</h3>
        <Prose text={c.oracao} className="italic" />
      </section>
      <p className="font-display text-[20px] leading-snug text-plum text-center px-2">{c.fraseDoDia}</p>
    </Card>
  )
}

const QUESTIONS: { key: keyof JournalFields; label: string; rows: number }[] = [
  { key: 'reflectionGod', label: 'O que este texto revela sobre Deus?', rows: 3 },
  { key: 'reflectionHumanity', label: 'O que revela sobre o ser humano?', rows: 3 },
  { key: 'personalReflection', label: 'O que isso desperta em mim?', rows: 4 },
]

function JournalForm({ s, entry, onDone }: { s: SpiritualSession; entry?: SpiritualJournalEntry; onDone?: () => void }) {
  const [f, setF] = useState<JournalFields>(() => ({
    reflectionGod: entry?.reflectionGod ?? '',
    reflectionHumanity: entry?.reflectionHumanity ?? '',
    personalReflection: entry?.personalReflection ?? '',
    keyword: entry?.keyword ?? '',
    prayer: entry?.prayer ?? '',
    notes: entry?.notes ?? '',
  }))
  const set = (k: keyof JournalFields) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const save = () => {
    if (!saveJournal(s.id, f, entry?.id)) return
    void persist()
    toast(entry ? 'Reflexão atualizada' : 'Reflexão guardada')
    onDone?.()
  }
  return (
    <Card className="space-y-4">
      {QUESTIONS.map((q) => (
        <Field key={q.key} label={q.label}>
          <TextArea rows={q.rows} value={f[q.key] ?? ''} onChange={set(q.key)} />
        </Field>
      ))}
      <Field label="Palavra-chave">
        <TextInput value={f.keyword ?? ''} onChange={set('keyword')} placeholder="uma palavra para lembrar" />
      </Field>
      <Field label="Oração">
        <TextArea rows={3} value={f.prayer ?? ''} onChange={set('prayer')} />
      </Field>
      <Field label="Anotações">
        <TextArea rows={3} value={f.notes ?? ''} onChange={set('notes')} />
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" disabled={isEmptyJournal(f)} onClick={save}>
          {entry ? 'Salvar alterações' : 'Guardar reflexão'}
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        )}
      </div>
    </Card>
  )
}

function JournalEntryCard({ s, e }: { s: SpiritualSession; e: SpiritualJournalEntry }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <JournalForm s={s} entry={e} onDone={() => setEditing(false)} />
  const rows: [string, string | undefined][] = [
    ...QUESTIONS.map((q) => [q.label, e[q.key]] as [string, string | undefined]),
    ['Oração', e.prayer],
    ['Anotações', e.notes],
  ]
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] text-muted">{formatShortDate(toDateKey(new Date(e.createdAt)))}{e.updatedAt !== e.createdAt ? ' · editada' : ''}</div>
          {e.keyword && <div className="font-display text-[20px] mt-0.5">{e.keyword}</div>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Editar
        </Button>
      </div>
      <div className="space-y-3 mt-3">
        {rows
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <div key={label}>
              <div className="text-[12px] text-muted">{label}</div>
              <Prose text={v!} className="text-[15px]" />
            </div>
          ))}
      </div>
    </Card>
  )
}
