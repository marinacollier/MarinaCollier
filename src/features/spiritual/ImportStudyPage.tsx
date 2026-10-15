/**
 * "Importar estudo": paste JSON → check → preview per field (o que já está vs o que chegou) → Aplicar.
 * Her own notebook text is marked "seu texto" and unchecked by default. Nothing is written before Aplicar;
 * the session status never changes here.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { Button, Card, Checkbox, Field, Page, PageHeader, TextArea } from '@/components/ui'
import { persist, useDB } from '@/data/store'
import { applyStudyImport, IMPORT_EXAMPLE, parseStudyImport, previewStudyImport, type StudyImport } from '@/data/spiritual/import'
import { formatShortDate, toDateKey } from '@/lib/date'
import { cn } from '@/lib/cn'

export default function ImportStudyPage() {
  const db = useDB()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const fallbackId = params.get('estudo') ?? undefined
  const fallback = fallbackId ? db.spiritualSessions.find((s) => s.id === fallbackId) : undefined
  const [text, setText] = useState('')
  const [data, setData] = useState<StudyImport>()
  const [errors, setErrors] = useState<string[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const preview = useMemo(() => (data ? previewStudyImport(db, data, fallbackId) : undefined), [db, data, fallbackId])
  const history = (db.profile.spiritualImports ?? []).slice(-5).reverse()

  const check = () => {
    const r = parseStudyImport(fallbackId && !/"(reference|sessionId)"/.test(text) ? injectSession(text, fallbackId) : text)
    if (!r.ok) {
      setData(undefined)
      return setErrors(r.errors)
    }
    const p = previewStudyImport(db, r.data, fallbackId)
    if (!p) {
      setData(undefined)
      return setErrors([`Não encontrei “${r.data.reference ?? r.data.sessionId}” nos seus planos.`])
    }
    setErrors([])
    setData(r.data)
    setChecked(new Set(p.fields.filter((f) => f.defaultChecked).map((f) => f.key)))
  }

  const apply = () => {
    if (!data || !preview) return
    const written = applyStudyImport(data, [...checked], fallbackId)
    void persist()
    toast(written.length ? `${written.length} ${written.length === 1 ? 'campo importado' : 'campos importados'} em ${preview.session.scriptureReference}` : 'Nada novo para importar')
    nav(ROUTES.bibleSession(preview.session.id), { replace: true })
  }

  const toggle = (k: string, v: boolean) =>
    setChecked((s) => {
      const n = new Set(s)
      if (v) n.add(k)
      else n.delete(k)
      return n
    })

  const actionable = preview?.fields.filter((f) => !f.same) ?? []

  return (
    <Page>
      <PageHeader title="Importar estudo" eyebrow={fallback?.scriptureReference ?? 'Bíblia'} subtitle="Cole o JSON do estudo. Nada muda antes de você revisar." back backTo={fallback ? ROUTES.bibleSession(fallback.id) : ROUTES.bible} />

      {!preview ? (
        <Card className="space-y-3">
          <Field label="JSON do estudo" hint={fallback ? `Sem “reference”, vai para ${fallback.scriptureReference}.` : 'Precisa de “reference” (ex.: "Amós 5") ou “sessionId”.'}>
            <TextArea aria-label="JSON do estudo" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={IMPORT_EXAMPLE} className="font-mono text-[13px]" />
          </Field>
          {errors.length > 0 && (
            <ul className="text-[13px] text-accent space-y-1">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <Button variant="primary" block disabled={!text.trim()} onClick={check}>
            Revisar
          </Button>
        </Card>
      ) : (
        <>
          <Card className="space-y-1">
            <div className="eyebrow">Destino</div>
            <div className="font-display text-[20px]">{preview.session.scriptureReference} · {preview.session.title}</div>
            <p className="text-[13px] text-muted">O status do estudo não muda.{preview.alreadyImported ? ' Este mesmo conteúdo já foi importado antes.' : ''}</p>
          </Card>
          <div className="grid gap-2 mt-3">
            {preview.fields.map((f) => (
              <Card key={f.key} className={cn('space-y-2', f.same && 'opacity-70')}>
                <div className="flex items-center gap-3">
                  {f.same ? <span className="text-[12px] text-muted w-6 text-center">=</span> : <Checkbox size="sm" checked={checked.has(f.key)} onChange={(v) => toggle(f.key, v)} label={`Importar ${f.label}`} />}
                  <div className="font-medium text-[15px] flex-1">{f.label}</div>
                  <span className="text-[11px] text-muted">{f.target === 'study' ? 'estudo' : 'caderno'}</span>
                  {f.mine && <span className="text-[11px] px-2 py-0.5 rounded-full bg-plum-soft text-plum">seu texto</span>}
                  {f.same && <span className="text-[11px] text-muted">igual</span>}
                </div>
                {f.existing && !f.same && (
                  <div>
                    <div className="text-[11px] text-muted">Agora</div>
                    <p className="text-[14px] text-ink-2 line-clamp-3 whitespace-pre-line">{f.existing}</p>
                  </div>
                )}
                <div>
                  {!f.same && f.existing && <div className="text-[11px] text-muted">Chegou</div>}
                  <p className="text-[14px] text-ink line-clamp-4 whitespace-pre-line">{f.incoming}</p>
                </div>
              </Card>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="primary" className="flex-1" disabled={!actionable.some((f) => checked.has(f.key))} onClick={apply}>
              Aplicar {checked.size ? `(${[...checked].filter((k) => actionable.some((f) => f.key === k)).length})` : ''}
            </Button>
            <Button variant="ghost" onClick={() => setData(undefined)}>
              Voltar
            </Button>
          </div>
        </>
      )}

      {history.length > 0 && (
        <div className="mt-8 px-1">
          <div className="eyebrow mb-2">Importações</div>
          <ul className="space-y-1 text-[13px] text-muted">
            {history.map((h) => (
              <li key={h.at + h.hash}>
                {formatShortDate(toDateKey(new Date(h.at)))} · {h.reference} · {h.fields.length} {h.fields.length === 1 ? 'campo' : 'campos'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  )
}

/** When opened from a study and the JSON names no session, target that study. */
function injectSession(text: string, id: string): string {
  try {
    const v = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''))
    if (v && typeof v === 'object' && !Array.isArray(v)) return JSON.stringify({ ...v, sessionId: id })
  } catch {
    /* let the parser report it */
  }
  return text
}
