/**
 * One study, in three steps: Ler · Refletir · Orar. What she types lives in this page's state (switching steps
 * keeps it) and autosaves — debounced — into ONE notebook record per session ("Salvando…/Salvo").
 * "Concluir estudo" is her choice and never requires the notebook; opening, writing or generating never marks done.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { Button, Card, EmptyState, Field, MoreOptions, Page, PageHeader, Segmented, TextArea, TextInput } from '@/components/ui'
import { persist, useDB } from '@/data/store'
import { journalFor, latestStudy, nextPendingAfter, sessionsOf } from '@/data/spiritual/model'
import { currentJournal, saveJournalDraft, type JournalFields } from '@/data/spiritual/ops'
import type { SpiritualJournalEntry, SpiritualSession, SpiritualStudy } from '@/data/types'
import { useAuth } from '@/integrations/auth'
import { formatShortDate, toDateKey } from '@/lib/date'
import { cn } from '@/lib/cn'
import { AVAILABILITY_TEXT, generateStudy, importRoute, STUDY_SECTIONS, studyAvailability } from './study'
import { checkSession, doneLabel, Prose } from './parts'

type Step = 'ler' | 'refletir' | 'orar'
type Mode = 'livre' | 'guiada'
type SaveState = 'idle' | 'saving' | 'saved'

const STEPS: { value: Step; label: string }[] = [
  { value: 'ler', label: 'Ler' },
  { value: 'refletir', label: 'Refletir' },
  { value: 'orar', label: 'Orar' },
]

export default function SessionPage() {
  const { id = '' } = useParams()
  const db = useDB()
  const s = db.spiritualSessions.find((x) => x.id === id)
  if (!s)
    return (
      <Page>
        <PageHeader title="Estudo" back backTo={ROUTES.bible} />
        <EmptyState emoji="🕊️" title="Estudo não encontrado" />
      </Page>
    )
  return <SessionFlow key={s.id} s={s} />
}

const fieldsOf = (e?: SpiritualJournalEntry): JournalFields => ({
  reflectionGod: e?.reflectionGod ?? '',
  reflectionHumanity: e?.reflectionHumanity ?? '',
  personalReflection: e?.personalReflection ?? '',
  keyword: e?.keyword ?? '',
  prayer: e?.prayer ?? '',
  notes: e?.notes ?? '',
})

/** Debounced autosave into the session's single notebook record; flushes on leave. */
function useJournalAutosave(sessionId: string, f: JournalFields, delay = 700) {
  const [state, setState] = useState<SaveState>('idle')
  const pending = useRef<JournalFields | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const saved = useRef(JSON.stringify(f))

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const p = pending.current
    if (!p) return
    pending.current = null
    saved.current = JSON.stringify(p)
    saveJournalDraft(sessionId, p)
    void persist().then(() => setState((x) => (pending.current ? x : 'saved')))
  }, [sessionId])

  useEffect(() => {
    if (JSON.stringify(f) === saved.current) {
      // Back to what is already saved (or the first render): nothing to write.
      if (pending.current) {
        clearTimeout(timer.current)
        pending.current = null
        setState('saved')
      }
      return
    }
    pending.current = f
    setState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }, [f, delay, flush])

  useEffect(() => () => flush(), [flush])
  return { state, flush }
}

function SessionFlow({ s }: { s: SpiritualSession }) {
  const db = useDB()
  const nav = useNavigate()
  const plan = db.spiritualPlans.find((p) => p.id === s.planId)
  const siblings = useMemo(() => sessionsOf(db, s.planId), [db, s.planId])
  const entries = useMemo(() => journalFor(db, s.id), [db, s.id])
  const study = useMemo(() => latestStudy(db, s.id), [db, s.id])
  const nextPending = useMemo(() => nextPendingAfter(db, s.id), [db, s.id])
  const [step, setStep] = useState<Step>('ler')
  const [f, setF] = useState<JournalFields>(() => fieldsOf(currentJournal(s.id)))
  const [mode, setMode] = useState<Mode>(() => (f.reflectionGod || f.reflectionHumanity ? 'guiada' : 'livre'))
  const [aiNotes, setAiNotes] = useState('')
  const { state: saveState, flush } = useJournalAutosave(s.id, f)
  const set = (k: keyof JournalFields) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  const i = siblings.findIndex((x) => x.id === s.id)
  const prev = siblings[i - 1]
  const next = siblings[i + 1]
  const done = s.status === 'concluido'
  const go = (id: string) => {
    flush()
    nav(ROUTES.bibleSession(id), { replace: true })
  }
  const conclude = () => {
    flush()
    checkSession(s, !done)
  }

  return (
    <Page>
      <PageHeader title={s.scriptureReference} eyebrow={plan?.title} subtitle={s.title} back backTo={plan ? ROUTES.biblePlan(plan.id) : ROUTES.bible} />

      <div className="flex items-center justify-between gap-3 -mt-1">
        <div className="text-[13px] text-muted min-w-0">
          {done ? doneLabel(s) : s.status === 'em_andamento' ? 'Em andamento' : 'Ainda não estudado'} · ~{s.estimatedMinutes} min
        </div>
        <Button variant={done ? 'ghost' : 'soft'} size="sm" onClick={conclude}>
          {done ? 'Desmarcar' : 'Concluir estudo'}
        </Button>
      </div>

      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur pt-3 pb-2 -mx-1 px-1">
        <Segmented value={step} onChange={setStep} options={STEPS} />
        <div className="h-4 mt-1 text-right text-[12px] text-muted" aria-live="polite">
          {saveState === 'saving' ? 'Salvando…' : saveState === 'saved' ? 'Salvo' : ''}
        </div>
      </div>

      {step === 'ler' && <ReadStep s={s} planTitle={plan?.title} study={study} notes={aiNotes} setNotes={setAiNotes} />}

      {step === 'refletir' && (
        <div className="space-y-3">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Segmented
                className="flex-1"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'livre', label: 'Escrita livre' },
                  { value: 'guiada', label: 'Escrita guiada' },
                ]}
              />
            </div>
            {mode === 'livre' ? (
              <>
                <TextArea
                  aria-label="Escrita livre"
                  rows={8}
                  value={f.personalReflection ?? ''}
                  onChange={set('personalReflection')}
                  placeholder="Escreva livremente o que este texto desperta em você…"
                  className="text-[16px] leading-relaxed"
                />
                <MoreOptions label="perguntas-guia" defaultOpen={!!(f.reflectionGod || f.reflectionHumanity)}>
                  <Field label="O que este texto revela sobre Deus?">
                    <TextArea rows={3} value={f.reflectionGod ?? ''} onChange={set('reflectionGod')} />
                  </Field>
                  <Field label="O que revela sobre o ser humano?">
                    <TextArea rows={3} value={f.reflectionHumanity ?? ''} onChange={set('reflectionHumanity')} />
                  </Field>
                </MoreOptions>
              </>
            ) : (
              <>
                <Field label="O que este texto revela sobre Deus?">
                  <TextArea rows={3} value={f.reflectionGod ?? ''} onChange={set('reflectionGod')} />
                </Field>
                <Field label="O que revela sobre o ser humano?">
                  <TextArea rows={3} value={f.reflectionHumanity ?? ''} onChange={set('reflectionHumanity')} />
                </Field>
                <Field label="O que isso desperta em mim?">
                  <TextArea aria-label="O que isso desperta em mim?" rows={4} value={f.personalReflection ?? ''} onChange={set('personalReflection')} />
                </Field>
              </>
            )}
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-muted shrink-0">Palavra-chave</span>
              <TextInput aria-label="Palavra-chave" value={f.keyword ?? ''} onChange={set('keyword')} placeholder="uma palavra" className="flex-1" />
            </div>
            <MoreOptions label="anotações" defaultOpen={!!f.notes}>
              <TextArea aria-label="Anotações" rows={3} value={f.notes ?? ''} onChange={set('notes')} />
            </MoreOptions>
            <p className="text-[12px] text-muted">
              Foto do caderno: ainda não — por enquanto, transcreva ou{' '}
              <button type="button" className="underline" onClick={() => nav(importRoute(s.id))}>
                importe o estudo
              </button>
              .
            </p>
          </Card>
          {entries.length > 1 && (
            <MoreOptions label={`reflexões anteriores (${entries.length - 1})`}>
              {entries.slice(1).map((e) => (
                <EntryView key={e.id} e={e} />
              ))}
            </MoreOptions>
          )}
        </div>
      )}

      {step === 'orar' && (
        <Card className="space-y-4">
          {study?.content.oracao && (
            <div>
              <div className="eyebrow mb-1.5">Oração do estudo</div>
              <Prose text={study.content.oracao} className="italic text-[15px]" />
            </div>
          )}
          <Field label="Sua oração (opcional)">
            <TextArea aria-label="Sua oração" rows={5} value={f.prayer ?? ''} onChange={set('prayer')} />
          </Field>
          {!done ? (
            <Button variant="primary" block onClick={conclude}>
              Concluir estudo
            </Button>
          ) : (
            <p className="text-[13px] text-muted">{doneLabel(s)}</p>
          )}
          <p className="text-[12px] text-muted">Concluir não depende do caderno — escreva quando fizer sentido.</p>
        </Card>
      )}

      <nav className="mt-6 space-y-2">
        <div className="flex justify-between gap-3">
          {prev ? (
            <Button variant="ghost" size="sm" icon={<ChevronLeft size={16} />} onClick={() => go(prev.id)}>
              {prev.scriptureReference}
            </Button>
          ) : (
            <span />
          )}
          {next && (
            <Button variant="ghost" size="sm" onClick={() => go(next.id)}>
              {next.scriptureReference}
              <ChevronRight size={16} />
            </Button>
          )}
        </div>
        {nextPending && nextPending.id !== next?.id && (
          <Button variant="soft" block size="sm" onClick={() => go(nextPending.id)}>
            Próximo pendente: {nextPending.scriptureReference}
          </Button>
        )}
        {done && nextPending && nextPending.id === next?.id && (
          <Button variant="soft" block size="sm" onClick={() => go(nextPending.id)}>
            Seguir para {nextPending.scriptureReference}
          </Button>
        )}
        <DoneHistory siblings={siblings} current={s.id} onOpen={go} />
      </nav>
    </Page>
  )
}

function DoneHistory({ siblings, current, onOpen }: { siblings: SpiritualSession[]; current: string; onOpen: (id: string) => void }) {
  const list = siblings.filter((x) => x.status === 'concluido' && x.id !== current)
  if (!list.length) return null
  return (
    <MoreOptions label={`concluídos neste plano (${list.length})`}>
      <ul className="divide-y divide-line/60 -mt-2">
        {list.map((x) => (
          <li key={x.id}>
            <button type="button" className="w-full text-left py-2.5 text-[14px] flex justify-between gap-3" onClick={() => onOpen(x.id)}>
              <span className="truncate">{x.scriptureReference} · {x.title}</span>
              <span className="text-muted text-[12px] shrink-0">{doneLabel(x)?.replace(/^concluído\s?·?\s?/, '') || '✓'}</span>
            </button>
          </li>
        ))}
      </ul>
    </MoreOptions>
  )
}

function ReadStep({ s, planTitle, study, notes, setNotes }: { s: SpiritualSession; planTitle?: string; study?: SpiritualStudy; notes: string; setNotes: (v: string) => void }) {
  const nav = useNavigate()
  const signedIn = useAuth((a) => a.signedIn)
  const availability = studyAvailability(signedIn)
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
    <div className="space-y-3">
      <p className="text-[15px] text-ink-2 px-0.5">
        Leia <span className="font-medium text-ink">{s.scriptureReference}</span> com calma. Quando quiser, passe para Refletir.
      </p>
      {study && <StudyView study={study} />}
      {asking ? (
        <Card>
          {availability === 'ready' ? (
            <>
              <Field label="Suas anotações (opcional)" hint="Notas da sua Bíblia de estudo ou uma transcrição.">
                <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cole aqui o que quiser que o estudo considere" />
              </Field>
              <Button variant="primary" block className="mt-3" disabled={busy} onClick={() => void run()}>
                {busy ? 'Preparando o estudo…' : 'Estudar com IA'}
              </Button>
              {error && <p className="text-[13px] text-accent mt-2">{error}</p>}
            </>
          ) : (
            <p className="text-[13px] text-muted">{AVAILABILITY_TEXT[availability]}</p>
          )}
          <Button variant="outline" block size="sm" className="mt-3" onClick={() => nav(importRoute(s.id))}>
            Importar estudo (colar JSON)
          </Button>
        </Card>
      ) : (
        <div className="flex gap-4 px-1">
          <button type="button" className="text-[13px] text-muted h-10" onClick={() => setAsking(true)}>
            Gerar outro estudo
          </button>
          <button type="button" className="text-[13px] text-muted h-10" onClick={() => nav(importRoute(s.id))}>
            Importar estudo
          </button>
        </div>
      )}
    </div>
  )
}

function StudyView({ study }: { study: SpiritualStudy }) {
  const c = study.content
  const sections = STUDY_SECTIONS.filter(({ key }) => c[key]?.trim())
  return (
    <Card className="space-y-6">
      <div className="text-[12px] text-muted">
        {study.contentSource === 'importado' ? 'Importado' : 'Preparado pela Lumos'} em {formatShortDate(toDateKey(new Date(study.generatedAt)))}
        {study.userNotes ? ' · com suas anotações' : ''}
      </div>
      {sections.map(({ key, label }) => (
        <section key={key}>
          <h3 className="eyebrow mb-2">{key === 'explicacao' && study.contentSource === 'importado' ? 'Resumo' : label}</h3>
          <Prose text={c[key]} />
        </section>
      ))}
      {c.perguntas.length > 0 && (
        <section>
          <h3 className="eyebrow mb-2">Perguntas para o caderno</h3>
          <ol className="list-decimal pl-5 space-y-2 text-[16px] leading-[1.6] text-ink-2">
            {c.perguntas.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </section>
      )}
      {c.fraseDoDia && <p className="font-display text-[20px] leading-snug text-plum text-center px-2">{c.fraseDoDia}</p>}
    </Card>
  )
}

const ENTRY_ROWS: [keyof JournalFields, string][] = [
  ['reflectionGod', 'Sobre Deus'],
  ['reflectionHumanity', 'Sobre o ser humano'],
  ['personalReflection', 'O que despertou em mim'],
  ['prayer', 'Oração'],
  ['notes', 'Anotações'],
]

function EntryView({ e }: { e: SpiritualJournalEntry }) {
  return (
    <Card className={cn('space-y-2')}>
      <div className="text-[12px] text-muted">
        {formatShortDate(toDateKey(new Date(e.createdAt)))}
        {e.keyword ? ` · ${e.keyword}` : ''}
      </div>
      {ENTRY_ROWS.filter(([k]) => e[k]).map(([k, label]) => (
        <div key={k}>
          <div className="text-[12px] text-muted">{label}</div>
          <Prose text={e[k]!} className="text-[15px]" />
        </div>
      ))}
    </Card>
  )
}
