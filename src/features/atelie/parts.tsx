/** Ateliê Literário — small shared pieces (cards, badges, export panel). Serif for literary text, sans for UI. */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { Button, Pill } from '@/components/ui'
import type { LiteraryStatus, LiteraryWork } from '@/data/types'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { saveFile } from '@/features/settings/platform'
import { PROVENANCE_LABEL, STATUS_LABEL, workDateLabel } from './model'
import { slug, toMarkdown, toTxt } from './export'

/** Bodoni for reading, without the display weight/tracking used for titles. */
export const SERIF: CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: 0 }

const STATUS_TONE: Record<LiteraryStatus, string> = {
  ideia: 'bg-surface-2 text-ink-2',
  rascunho: 'bg-sand-soft text-sand',
  lapidacao: 'bg-plum-soft text-plum',
  final_aprovada: 'bg-sage-soft text-sage',
  publicado: 'bg-accent-soft text-accent',
  arquivado: 'bg-surface-2 text-muted',
}

export function StatusPill({ status, className }: { status: LiteraryStatus; className?: string }) {
  return <Pill className={cn(STATUS_TONE[status], className)}>{STATUS_LABEL[status]}</Pill>
}

export function PendingBadge() {
  return <Pill className="bg-transparent border border-dashed border-line text-muted">texto pendente</Pill>
}

export function ProvenanceNote({ work, className }: { work: LiteraryWork; className?: string }) {
  if (!work.provenance) return null
  return (
    <p className={cn('text-[12.5px] text-sand leading-snug', className)}>
      {PROVENANCE_LABEL[work.provenance]}
      {work.provenanceNote ? ` · ${work.provenanceNote}` : ''}
    </p>
  )
}

export function Tags({ tags, max = 4, className }: { tags: string[]; max?: number; className?: string }) {
  if (!tags.length) return null
  const shown = tags.slice(0, max)
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {shown.map((t) => (
        <span key={t} className="h-6 px-2 rounded-full border border-line text-[11.5px] text-ink-2 inline-flex items-center">
          {t}
        </span>
      ))}
      {tags.length > max && <span className="h-6 px-1 text-[11.5px] text-muted inline-flex items-center">+{tags.length - max}</span>}
    </div>
  )
}

/** A library card: serif title, status, date · genre, themes, "texto pendente". */
export function WorkCard({ work, meta, children }: { work: LiteraryWork; meta?: ReactNode; children?: ReactNode }) {
  const nav = useNavigate()
  return (
    <button type="button" onClick={() => nav(ROUTES.atelieWork(work.id))} className="card w-full text-left p-4 active:scale-[0.99] transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[21px] leading-tight">
            {work.title}
            {work.provisionalTitle && <span className="text-[12px] text-muted font-sans ml-1.5 align-middle">(provisório)</span>}
          </div>
          {work.subtitle && (
            <div className="text-[14px] text-ink-2 italic mt-0.5" style={SERIF}>
              {work.subtitle}
            </div>
          )}
          <div className="text-[12.5px] text-muted mt-1">{[workDateLabel(work), work.genre].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        <StatusPill status={work.status} />
        {work.textPending && <PendingBadge />}
      </div>
      <ProvenanceNote work={work} className="mt-2" />
      <Tags tags={work.themes} className="mt-2.5" />
      {meta && <div className="text-[12.5px] text-muted mt-2">{meta}</div>}
      {children}
    </button>
  )
}

/** Excerpts are shown as excerpts (quoted, italic) — never as the text. */
export function Excerpts({ excerpts, className }: { excerpts: string[]; className?: string }) {
  if (!excerpts.length) return null
  return (
    <div className={cn('space-y-2', className)}>
      {excerpts.map((e) => (
        <blockquote key={e} className="border-l-2 border-line pl-3 text-[16px] italic leading-relaxed text-ink-2" style={SERIF}>
          “{e}”
        </blockquote>
      ))}
    </div>
  )
}

/** Inside the Claude app (an iframe) downloads and the share sheet can be blocked: the text path always works. */
const embedded = () => typeof window !== 'undefined' && window.self !== window.top

/** TXT · Markdown · PDF (print) · copiar texto limpo, for one version. */
export function ExportPanel({ work, body, versionLabel }: { work: LiteraryWork; body: string; versionLabel?: string }) {
  const [asText, setAsText] = useState<string>()
  const download = async (ext: 'txt' | 'md') => {
    const content = ext === 'txt' ? toTxt(work, body) : toMarkdown(work, body)
    if (embedded()) return setAsText(content)
    try {
      const ok = await saveFile(`${slug(work.title)}.${ext}`, content, ext === 'txt' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8')
      if (ok) toast(ext === 'txt' ? 'TXT pronto ✓' : 'Markdown pronto ✓')
    } catch {
      setAsText(content)
    }
  }
  const copy = async (text: string) => {
    if (await copyText(text)) toast('Copiado ✓')
    else toast('Não consegui copiar — selecione o texto e toque em “Copiar”.')
  }
  const print = () => {
    try {
      window.print()
    } catch {
      toast('A impressão não está disponível aqui — use “Copiar texto limpo”.')
    }
  }
  if (!body.trim()) return <p className="text-[13px] text-muted">Ainda não há texto para exportar.</p>
  return (
    <div>
      {versionLabel && <p className="text-[12.5px] text-muted mb-2">{versionLabel}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => void copy(toTxt(work, body).replace(/\n$/, ''))}>
          Copiar texto limpo
        </Button>
        <Button size="sm" variant="soft" onClick={() => void download('txt')}>
          TXT
        </Button>
        <Button size="sm" variant="soft" onClick={() => void download('md')}>
          Markdown
        </Button>
        <Button size="sm" variant="soft" onClick={print}>
          PDF (imprimir)
        </Button>
      </div>
      {asText && (
        <div className="mt-3 space-y-2 rounded-2xl bg-surface-2 p-3">
          <p className="text-[13px] text-ink-2 leading-snug">Aqui dentro o download pode ser bloqueado. Copie o texto e cole onde quiser.</p>
          <textarea readOnly value={asText} rows={6} aria-label="Texto para copiar" className="w-full rounded-xl bg-surface p-2 font-mono text-[12px] leading-snug" />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => void copy(asText)}>
              Copiar tudo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsText(undefined)}>
              Fechar
            </Button>
          </div>
        </div>
      )}
      <PrintSheet title={work.title} subtitle={work.subtitle} body={body} />
    </div>
  )
}

/** Only this sheet is visible when printing (→ "Salvar como PDF"). */
function PrintSheet({ title, subtitle, body }: { title: string; subtitle?: string; body: string }) {
  return (
    <>
      <style>{`@media screen { .atelie-print { display: none } }
@media print {
  body * { visibility: hidden !important; }
  .atelie-print, .atelie-print * { visibility: visible !important; }
  .atelie-print { position: absolute; left: 0; top: 0; width: 100%; padding: 18mm 20mm; background: #fff; color: #111; }
  @page { margin: 0; }
}`}</style>
      <div className="atelie-print">
        <h1 style={{ ...SERIF, fontSize: '24pt', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ ...SERIF, fontStyle: 'italic', fontSize: '13pt', marginTop: '4pt' }}>{subtitle}</p>}
        <div style={{ ...SERIF, fontSize: '12.5pt', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: '18pt' }}>{body}</div>
      </div>
    </>
  )
}

/** "Tem certeza?" inline (no modal): one sentence + confirm/cancel. */
export function ConfirmInline({ text, confirmLabel, onConfirm, onCancel, tone = 'primary' }: { text: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; tone?: 'primary' | 'danger' }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3 mt-2" role="alertdialog" aria-label={confirmLabel}>
      <p className="text-[13.5px] text-ink-2 leading-snug">{text}</p>
      <div className="flex gap-2 mt-2.5">
        <Button size="sm" variant={tone === 'danger' ? 'outline' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
