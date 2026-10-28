/**
 * One work: Texto (editor with autosave + modo concentração) · Versões (history, compare, restore, favorite,
 * approve with confirmation, export) · Ficha (metadata, excerpts, collections, notes).
 * Versions are never overwritten: see ops.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, Maximize2, Star, X } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { Button, Card, Chip, DateInput, EmptyState, Field, Page, PageHeader, Pill, SectionTitle, Segmented, Select, TextArea, TextInput } from '@/components/ui'
import { LockGate } from '@/components/layout/LockGate'
import { persist, useDB } from '@/data/store'
import type { LiteraryVersion, LiteraryWork } from '@/data/types'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { diffStats, diffWords, type DiffPart } from './diff'
import { exerciseById } from './exercises'
import { latestVersion, ORIGIN_LABEL, parseTags, relatedWorks, STATUS_LABEL, STATUS_ORDER, versionsOf, wordCount, workDateLabel } from './model'
import { approveVersion, checkpoint, removeWork, restoreVersion, saveDraft, saveVersion, setInCollection, setVersionNote, toggleFavorite, undoRemoveWork, updateWork } from './ops'
import { ConfirmInline, Excerpts, ExportPanel, PendingBadge, ProvenanceNote, SERIF, StatusPill, Tags } from './parts'

type Tab = 'texto' | 'versoes' | 'ficha'

export default function WorkPage() {
  return (
    <LockGate area="atelie">
      <WorkLoader />
    </LockGate>
  )
}

function WorkLoader() {
  const { id = '' } = useParams()
  const workId = decodeURIComponent(id)
  const work = useDB((db) => db.literaryWorks.find((w) => w.id === workId))
  if (!work)
    return (
      <Page>
        <PageHeader title="Obra" back backTo={ROUTES.atelie + '?v=biblioteca'} search={false} />
        <EmptyState emoji="🖋️" title="Obra não encontrada" text="Ela pode ter sido apagada." />
      </Page>
    )
  return <WorkView key={work.id} work={work} />
}

function WorkView({ work }: { work: LiteraryWork }) {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('aba') === 'versoes' ? 'versoes' : params.get('aba') === 'ficha' ? 'ficha' : 'texto'
  const isNew = params.get('novo') === '1'
  const setTab = (t: Tab) => setParams(t === 'texto' ? {} : { aba: t }, { replace: true })
  const versions = useDB((db) => db.literaryVersions)
  const count = useMemo(() => versions.filter((v) => v.workId === work.id).length, [versions, work.id])

  return (
    <Page>
      <PageHeader
        title={
          <>
            {work.title}
            {work.provisionalTitle && <span className="block text-[13px] text-muted font-sans tracking-normal mt-1">título provisório</span>}
          </>
        }
        eyebrow={`Ateliê · ${workDateLabel(work)}`}
        subtitle={
          work.subtitle ? (
            <span className="italic" style={SERIF}>
              {work.subtitle}
            </span>
          ) : undefined
        }
        back
        backTo={ROUTES.atelie + '?v=biblioteca'}
        search={false}
      />
      <div className="flex flex-wrap items-center gap-1.5 -mt-2 mb-3">
        <StatusPill status={work.status} />
        {work.textPending && <PendingBadge />}
        {work.genre && <span className="text-[12.5px] text-muted ml-1">{work.genre}</span>}
      </div>
      <ProvenanceNote work={work} className="mb-3" />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'texto', label: 'Texto' },
          { value: 'versoes', label: count ? `Versões (${count})` : 'Versões' },
          { value: 'ficha', label: 'Ficha' },
        ]}
      />
      <div className="mt-4">
        {tab === 'texto' && <Editor work={work} autoFocus={isNew} />}
        {tab === 'versoes' && <Versions work={work} onRestored={() => setTab('texto')} />}
        {tab === 'ficha' && <Details work={work} />}
      </div>
    </Page>
  )
}

// ─── Editor ─────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved'

/** Debounced autosave into the working draft; on leave, the draft becomes a kept version (checkpoint). */
function useAutosave(workId: string, text: string, delay = 800) {
  const [state, setState] = useState<SaveState>('idle')
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const saved = useRef(text)

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const p = pending.current
    if (p === null) return
    pending.current = null
    saved.current = p
    saveDraft(workId, p)
    void persist().then(() => setState((x) => (pending.current !== null ? x : 'saved')))
  }, [workId])

  useEffect(() => {
    if (text === saved.current) {
      if (pending.current !== null) {
        clearTimeout(timer.current)
        pending.current = null
        setState('saved')
      }
      return
    }
    pending.current = text
    setState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }, [text, delay, flush])

  useEffect(
    () => () => {
      flush()
      checkpoint(workId)
      void persist()
    },
    [flush, workId],
  )

  const markSaved = (t: string) => {
    clearTimeout(timer.current)
    pending.current = null
    saved.current = t
    setState('saved')
  }
  return { state, flush, markSaved }
}

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.max(el.scrollHeight, 280)}px`
}

function Editor({ work, autoFocus }: { work: LiteraryWork; autoFocus?: boolean }) {
  const latest = useDB((db) => latestVersion(db, work.id))
  const [text, setText] = useState(() => latest?.body ?? '')
  const [focus, setFocus] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const { state, flush, markSaved } = useAutosave(work.id, text)
  const ref = useRef<HTMLTextAreaElement>(null)
  const words = wordCount(text)
  const frozen = !!latest?.approvedAt && latest.body === text

  useEffect(() => autoGrow(ref.current), [text, focus])
  useEffect(() => {
    if (!focus) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus])

  const keepVersion = () => {
    flush()
    const v = saveVersion(work.id, text, note)
    markSaved(text)
    void persist()
    setNoteOpen(false)
    setNote('')
    haptic('success')
    toast(v ? 'Versão guardada ✓' : 'Nada para guardar ainda.')
  }

  const status = state === 'saving' ? 'Salvando…' : state === 'saved' ? 'Salvo' : ''

  const area = (
    <textarea
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      autoFocus={autoFocus || focus}
      aria-label="Texto"
      placeholder={work.textPending ? 'Cole ou escreva o texto aqui quando quiser.' : 'Comece por onde quiser.'}
      spellCheck
      className={cn('w-full bg-transparent outline-none resize-none text-[18px] leading-[1.75] text-ink placeholder:text-muted/70', focus ? 'min-h-[70dvh]' : 'min-h-[280px]')}
      style={SERIF}
    />
  )

  if (focus)
    return (
      <div className="fixed inset-0 z-[70] bg-bg overflow-y-auto" role="dialog" aria-label="Modo concentração">
        <div className="sticky top-0 bg-bg/90 backdrop-blur flex items-center justify-between px-4 pt-safe pb-2 text-[12.5px] text-muted">
          <span aria-live="polite">
            {words} {words === 1 ? 'palavra' : 'palavras'}
            {status && ` · ${status}`}
          </span>
          <button type="button" className="h-10 px-3 rounded-full text-ink-2" onClick={() => setFocus(false)}>
            Sair
          </button>
        </div>
        <div className="mx-auto max-w-[620px] px-6 pb-[40dvh] pt-4">{area}</div>
      </div>
    )

  return (
    <div>
      {work.textPending && !latest && (
        <Card className="mb-4">
          <p className="text-[14px] text-ink-2 leading-snug">O texto integral ainda não está no app. Os trechos conhecidos ficam guardados como trechos — quando quiser, cole aqui a versão que você tem.</p>
          <Excerpts excerpts={work.excerpts} className="mt-3" />
        </Card>
      )}
      {latest?.approvedAt && (
        <p className="text-[13px] text-sage mb-3 leading-snug">
          {frozen ? 'Esta é a versão aprovada, congelada. Ao editar, uma nova versão começa — a aprovada continua guardada.' : 'Você está escrevendo uma nova versão. A aprovada continua guardada em Versões.'}
        </p>
      )}

      <div className="rounded-[1.125rem] bg-surface border border-line/60 px-5 py-4">{area}</div>

      <div className="flex items-center justify-between gap-2 mt-2 px-1 text-[12.5px] text-muted">
        <span>
          {words} {words === 1 ? 'palavra' : 'palavras'}
        </span>
        <span aria-live="polite">{status}</span>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <Button size="sm" variant="primary" onClick={() => (noteOpen ? keepVersion() : setNoteOpen(true))} disabled={!text.trim()}>
          Salvar versão
        </Button>
        <Button size="sm" variant="soft" icon={<Maximize2 size={15} />} onClick={() => setFocus(true)}>
          Concentração
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setExportOpen((v) => !v)} disabled={!text.trim()}>
          Exportar
        </Button>
      </div>
      {noteOpen && (
        <div className="mt-3 flex gap-2">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota da versão (opcional)" aria-label="Nota da versão" onKeyDown={(e) => e.key === 'Enter' && keepVersion()} />
          <Button variant="primary" onClick={keepVersion}>
            Guardar
          </Button>
        </div>
      )}
      {exportOpen && (
        <Card className="mt-3">
          <ExportPanel work={work} body={text} />
        </Card>
      )}
      <p className="text-[12px] text-muted mt-4 leading-snug">O texto se salva sozinho enquanto você escreve. Cada sessão vira uma versão recuperável em “Versões”.</p>

      {work.creationContext && (
        <>
          <SectionTitle>Contexto de criação</SectionTitle>
          <p className="text-[14px] text-ink-2 leading-relaxed px-1">{work.creationContext}</p>
        </>
      )}
      {(work.concept || work.centralImage) && (
        <>
          <SectionTitle>Ideia</SectionTitle>
          <div className="px-1 space-y-1.5 text-[14px] text-ink-2 leading-relaxed">
            {work.centralImage && <p>Imagem central: {work.centralImage}</p>}
            {work.concept && <p>{work.concept}</p>}
          </div>
        </>
      )}
      {latest && work.excerpts.length > 0 && (
        <>
          <SectionTitle>Trechos conhecidos</SectionTitle>
          <Excerpts excerpts={work.excerpts} />
        </>
      )}
    </div>
  )
}

// ─── Versions ───────────────────────────────────────────────────────────────

const when = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Versions({ work, onRestored }: { work: LiteraryWork; onRestored: () => void }) {
  const all = useDB((db) => db.literaryVersions)
  const versions = useMemo(() => versionsOf({ literaryVersions: all }, work.id), [all, work.id])
  const [open, setOpen] = useState<string>()
  const [a, setA] = useState<string>()
  const [b, setB] = useState<string>()
  const [comparing, setComparing] = useState(false)

  if (!versions.length)
    return <EmptyState emoji="📜" title="Nenhuma versão ainda" text={work.textPending ? 'O texto desta obra ainda está pendente. Quando você colar ou escrever, as versões aparecem aqui.' : 'Escreva em “Texto” — cada sessão vira uma versão.'} />

  const num = (v: LiteraryVersion) => versions.findIndex((x) => x.id === v.id) + 1
  const options = versions.map((v) => ({ value: v.id, label: `Versão ${num(v)} · ${when(v.createdAt)}` }))
  const va = versions.find((v) => v.id === (a ?? versions.at(-2)?.id))
  const vb = versions.find((v) => v.id === (b ?? versions.at(-1)?.id))

  return (
    <div>
      {versions.length > 1 && (
        <div className="mb-4">
          {!comparing ? (
            <Button size="sm" variant="soft" onClick={() => setComparing(true)}>
              Comparar duas versões
            </Button>
          ) : (
            <Card>
              <div className="flex items-center justify-between">
                <div className="eyebrow">Comparar</div>
                <button type="button" className="text-[13px] text-muted h-9" onClick={() => setComparing(false)}>
                  fechar
                </button>
              </div>
              <div className="grid gap-2 mt-2">
                <Select value={va?.id} onChange={setA} options={options} />
                <Select value={vb?.id} onChange={setB} options={options} />
              </div>
              {va && vb && <DiffView before={va.body} after={vb.body} />}
            </Card>
          )}
        </div>
      )}

      <div className="space-y-2.5">
        {[...versions].reverse().map((v) => (
          <VersionCard key={v.id} work={work} v={v} n={num(v)} restoredFrom={v.restoredFromId ? versions.find((x) => x.id === v.restoredFromId) : undefined} open={open === v.id} onToggle={() => setOpen(open === v.id ? undefined : v.id)} onRestored={onRestored} isLatest={v.id === versions.at(-1)?.id} />
        ))}
      </div>
      <p className="text-[12px] text-muted mt-4 leading-snug">Nada aqui é sobrescrito: restaurar cria uma versão nova, e uma versão aprovada fica congelada.</p>
    </div>
  )
}

function VersionCard({ work, v, n, open, onToggle, onRestored, isLatest, restoredFrom }: { work: LiteraryWork; v: LiteraryVersion; n: number; open: boolean; onToggle: () => void; onRestored: () => void; isLatest: boolean; restoredFrom?: LiteraryVersion }) {
  const [confirm, setConfirm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const approvedNow = work.approvedVersionId === v.id

  const restore = () => {
    restoreVersion(v.id)
    void persist()
    toast(`Versão ${n} restaurada como nova versão ✓`)
    onRestored()
  }
  const approve = () => {
    approveVersion(v.id)
    void persist()
    setConfirm(false)
    haptic('success')
    toast(`Versão ${n} aprovada como final ✓`, { tone: 'win' })
  }

  return (
    <Card className={cn(approvedNow && 'ring-1 ring-sage/50')}>
      <button type="button" className="w-full text-left" onClick={onToggle} aria-expanded={open}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-[19px]">Versão {n}</span>
          <span className="text-[12px] text-muted shrink-0">{when(v.createdAt)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="text-[12.5px] text-muted mr-1">{v.wordCount} palavras</span>
          {v.approvedAt && (
            <Pill className="bg-sage-soft text-sage">
              <Check size={12} /> {approvedNow ? 'aprovada' : 'aprovada antes'}
            </Pill>
          )}
          {v.favorite && (
            <Pill className="bg-sand-soft text-sand">
              <Star size={12} /> favorita
            </Pill>
          )}
          {v.draft && isLatest && <Pill>em andamento</Pill>}
          {restoredFrom && <span className="text-[12px] text-muted">restaurada</span>}
        </div>
        {v.note && <p className="text-[13px] text-ink-2 mt-1.5">{v.note}</p>}
      </button>
      {open && (
        <div className="mt-3">
          <div className="rounded-xl bg-surface-2/60 px-4 py-3 text-[16px] leading-[1.75] whitespace-pre-wrap max-h-[50dvh] overflow-y-auto" style={SERIF}>
            {v.body}
          </div>
          <TextInput className="mt-3" aria-label={`Nota da versão ${n}`} placeholder="Nota da versão" defaultValue={v.note ?? ''} onBlur={(e) => {
              if (e.target.value.trim() === (v.note ?? '')) return
              setVersionNote(v.id, e.target.value)
              void persist()
            }}
          />
          <div className="flex flex-wrap gap-2 mt-3">
            {!isLatest && (
              <Button size="sm" variant="soft" onClick={restore}>
                Restaurar como nova versão
              </Button>
            )}
            <Button
              size="sm"
              variant="soft"
              icon={<Star size={14} />}
              onClick={() => {
                const on = toggleFavorite(v.id)
                void persist()
                toast(on ? `Versão ${n} é a favorita ✓` : 'Favorita desmarcada')
              }}
            >
              {v.favorite ? 'Tirar favorita' : 'Favorita'}
            </Button>
            {!approvedNow && (
              <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>
                Aprovar como final
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setExporting((x) => !x)}>
              Exportar
            </Button>
          </div>
          {confirm && (
            <ConfirmInline
              text={`Aprovar a versão ${n} como versão final? Ela fica congelada — nada a sobrescreve. Edições depois disso viram novas versões.`}
              confirmLabel="Aprovar versão"
              onConfirm={approve}
              onCancel={() => setConfirm(false)}
            />
          )}
          {exporting && (
            <div className="mt-3">
              <ExportPanel work={work} body={v.body} versionLabel={`Versão ${n}`} />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function DiffView({ before, after }: { before: string; after: string }) {
  const parts: DiffPart[] = useMemo(() => diffWords(before, after), [before, after])
  const s = diffStats(parts)
  if (before === after) return <p className="text-[13.5px] text-muted mt-3">As duas versões têm o mesmo texto.</p>
  return (
    <div className="mt-3">
      <p className="text-[12.5px] text-muted">
        +{s.added} {s.added === 1 ? 'palavra' : 'palavras'} · −{s.removed} {s.removed === 1 ? 'palavra' : 'palavras'}
      </p>
      <div className="mt-2 rounded-xl bg-surface-2/60 px-4 py-3 text-[16px] leading-[1.75] whitespace-pre-wrap max-h-[60dvh] overflow-y-auto" style={SERIF} aria-label="Diferenças">
        {parts.map((p, i) =>
          p.op === 'same' ? (
            <span key={i}>{p.text}</span>
          ) : p.op === 'add' ? (
            <ins key={i} className="no-underline bg-sage-soft text-ink rounded-sm">
              {p.text}
            </ins>
          ) : (
            <del key={i} className="bg-plum-soft text-muted line-through rounded-sm mr-0.5">
              {p.text}
            </del>
          ),
        )}
      </div>
      <p className="text-[12px] text-muted mt-1.5">
        <span className="bg-sage-soft px-1 rounded-sm">entrou</span> · <span className="bg-plum-soft px-1 rounded-sm line-through">saiu</span>
      </p>
    </div>
  )
}

// ─── Ficha ──────────────────────────────────────────────────────────────────

function Details({ work }: { work: LiteraryWork }) {
  const nav = useNavigate()
  const cols = useDB((db) => db.literaryCollections)
  const db = useDB()
  const related = useMemo(() => relatedWorks(db, work.id), [db, work.id])
  const [excerpt, setExcerpt] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ex = exerciseById(work.exerciseId)
  const save = (patch: Partial<LiteraryWork>) => {
    updateWork(work.id, patch)
    void persist()
  }
  const text = (key: keyof LiteraryWork, label: string, opts: { area?: boolean; serif?: boolean; placeholder?: string } = {}) => {
    const value = (work[key] as string | undefined) ?? ''
    const commit = (v: string) => v.trim() !== value && save({ [key]: v.trim() || undefined } as Partial<LiteraryWork>)
    return (
      <Field label={label}>
        {opts.area ? (
          <TextArea aria-label={label} defaultValue={value} rows={3} placeholder={opts.placeholder} onBlur={(e) => commit(e.target.value)} style={opts.serif ? SERIF : undefined} />
        ) : (
          <TextInput aria-label={label} defaultValue={value} placeholder={opts.placeholder} onBlur={(e) => commit(e.target.value)} style={opts.serif ? SERIF : undefined} />
        )}
      </Field>
    )
  }

  return (
    <div className="space-y-4">
      <Field label="Título">
        <TextInput aria-label="Título" defaultValue={work.title} style={SERIF} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== work.title && save({ title: e.target.value.trim() })} />
        <label className="flex items-center gap-2 mt-2 text-[13.5px] text-ink-2">
          <input type="checkbox" checked={!!work.provisionalTitle} onChange={(e) => save({ provisionalTitle: e.target.checked || undefined })} className="h-4 w-4 accent-[var(--accent)]" />
          título provisório
        </label>
      </Field>
      {text('subtitle', 'Subtítulo', { serif: true })}

      <Field label="Status">
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.filter((s) => s !== 'final_aprovada' || work.status === s).map((s) => (
            <Chip key={s} selected={work.status === s} onClick={() => s !== work.status && save({ status: s })}>
              {STATUS_LABEL[s]}
            </Chip>
          ))}
        </div>
        <span className="block text-[12px] text-muted mt-1.5 px-0.5">“Versão final aprovada” só acontece quando você aprova uma versão (em Versões).</span>
        {work.statusNote && <span className="block text-[12px] text-muted mt-1 px-0.5">Registro inicial: {work.statusNote}.</span>}
      </Field>
      {work.provenance && (
        <Card className="bg-sand-soft/50">
          <ProvenanceNote work={work} />
          <p className="text-[12.5px] text-muted mt-1">Não é a versão aprovada: só indica que existe uma versão fora do app.</p>
          <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={() => save({ provenance: undefined, provenanceNote: undefined })}>
            Já verifiquei — tirar aviso
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        {text('dateLabel', 'Quando foi escrita', { placeholder: 'ex.: jul/2026' })}
        <Field label="Dia exato">
          <DateInput value={work.date} onChange={(v) => save({ date: v })} aria-label="Dia exato" />
        </Field>
      </div>
      {text('genre', 'Gênero', { placeholder: 'Poesia, prosa poética…' })}
      <TagField label="Temas" value={work.themes} onSave={(themes) => save({ themes })} />
      <TagField label="Imagens e símbolos" value={work.symbols} onSave={(symbols) => save({ symbols })} />
      {text('centralImage', 'Imagem central', { area: true })}
      {text('concept', 'Ideia / conceito', { area: true })}
      {text('creationContext', 'Contexto de criação', { area: true })}
      {text('authorNotes', 'Anotações da autora', { area: true })}

      <Field label="Trechos conhecidos" hint="Guardados como trechos — não viram o texto da obra.">
        <div className="space-y-1.5">
          {work.excerpts.map((x) => (
            <div key={x} className="flex items-start gap-2">
              <p className="flex-1 text-[15px] italic leading-snug text-ink-2" style={SERIF}>
                “{x}”
              </p>
              <button type="button" aria-label="Tirar trecho" className="h-8 w-8 inline-flex items-center justify-center text-muted shrink-0" onClick={() => save({ excerpts: work.excerpts.filter((e) => e !== x) })}>
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
        <form
          className="flex gap-2 mt-2"
          onSubmit={(e) => {
            e.preventDefault()
            const t = excerpt.trim()
            if (!t || work.excerpts.includes(t)) return
            save({ excerpts: [...work.excerpts, t] })
            setExcerpt('')
          }}
        >
          <TextInput value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Novo trecho" aria-label="Novo trecho" style={SERIF} />
          <Button type="submit" variant="soft" disabled={!excerpt.trim()}>
            Guardar
          </Button>
        </form>
      </Field>

      {cols.length > 0 && (
        <Field label="Coleções">
          <div className="flex flex-wrap gap-2">
            {cols.map((c) => {
              const on = work.collectionIds.includes(c.id)
              return (
                <Chip
                  key={c.id}
                  selected={on}
                  onClick={() => {
                    setInCollection(c.id, work.id, !on)
                    void persist()
                  }}
                >
                  {c.name}
                </Chip>
              )
            })}
          </div>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Publicada em">
          <DateInput value={work.publishedAt} onChange={(v) => save({ publishedAt: v })} aria-label="Publicada em" />
        </Field>
        {text('publishedLink', 'Link', { placeholder: 'https://' })}
      </div>

      {(work.origin || ex) && (
        <Card>
          <div className="eyebrow">Começou por</div>
          <p className="text-[14px] text-ink-2 mt-1">{ex ? `Exercício: ${ex.title}` : work.origin ? ORIGIN_LABEL[work.origin] : ''}</p>
          {ex && <p className="text-[13px] text-muted mt-1">{ex.prompt}</p>}
          {work.origin === 'exercicio' && <div className="mt-3">{text('learned', 'O que aprendi', { area: true })}</div>}
        </Card>
      )}

      {related.length > 0 && (
        <>
          <SectionTitle>Conversa com</SectionTitle>
          <div className="space-y-2">
            {related.slice(0, 6).map((r) => (
              <button key={r.work.id} type="button" className="card w-full text-left px-4 py-3" onClick={() => nav(ROUTES.atelieWork(r.work.id))}>
                <div className="font-display text-[17px]">{r.work.title}</div>
                <Tags tags={r.shared} className="mt-1.5" />
              </button>
            ))}
          </div>
        </>
      )}

      <div className="pt-4">
        {!confirmDelete ? (
          <button type="button" className="text-[13px] text-muted h-10" onClick={() => setConfirmDelete(true)}>
            Apagar obra
          </button>
        ) : (
          <ConfirmInline
            tone="danger"
            text="Apagar esta obra e todas as versões dela? Dá para desfazer logo depois."
            confirmLabel="Apagar obra"
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => {
              const saved = removeWork(work.id)
              void persist()
              nav(ROUTES.atelie + '?v=biblioteca')
              toast('Obra apagada', {
                action: {
                  label: 'Desfazer',
                  run: () => {
                    undoRemoveWork(saved)
                    void persist()
                  },
                },
              })
            }}
          />
        )}
      </div>
    </div>
  )
}

function TagField({ label, value, onSave }: { label: string; value: string[]; onSave: (v: string[]) => void }) {
  return (
    <Field label={label} hint="Separados por vírgula.">
      <TextInput
        aria-label={label}
        defaultValue={value.join(', ')}
        onBlur={(e) => {
          const next = parseTags(e.target.value)
          if (next.join('|') !== value.join('|')) onSave(next)
        }}
      />
    </Field>
  )
}
