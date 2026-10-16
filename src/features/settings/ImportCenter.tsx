/**
 * Central de importação — ONE paste box for everything that comes from outside:
 *   marina-os/changes@1 (ChatGPT, scripts) → reconciled preview with per-item diffs → Confirmar → one batch
 *   Daily Executive Briefing JSON           → the existing briefing importer (planBriefing / applyPlan)
 * Nothing is written while previewing. Deletes and conflict overwrites need a per-item yes (off by default).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '@/app/ui-store'
import { Button, Card, TextArea } from '@/components/ui'
import { undoBatch } from '@/data/briefing/apply'
import { bundledSyncOf, markSyncApplied } from '@/data/briefing/bundled'
import { planBriefing, readBriefing, type BriefingPlan } from '@/data/briefing/import'
import { importChanges, lockNow } from '@/data/changes/apply'
import { looksLikeChanges, parseChanges, type ChangesDoc, type ValidationIssue } from '@/data/changes/contract'
import { countPlan, planChanges, planLine, willWrite, type ItemAction, type PlanItem } from '@/data/changes/plan'
import { getDB, persist, useDB } from '@/data/store'
import { useLockState } from '@/app/lock-store'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { uid } from '@/lib/id'
import { Toggle } from './components'
import { BriefingPreview } from './ImportHistory'

const ACTION_LABEL: Record<ItemAction, string> = {
  create: 'novo',
  update: 'atualiza',
  complete: 'conclui',
  move: 'move',
  archive: 'arquiva',
  delete: 'exclui',
  unchanged: 'já existe',
  conflict: 'conflito',
  review: 'precisa de revisão',
  blocked: 'bloqueado',
  unsupported: 'não suportado ainda',
  invalid: 'inválido',
  refused: 'recusado',
}
const ACTION_TONE: Partial<Record<ItemAction, string>> = { create: 'text-sage', delete: 'text-accent', conflict: 'text-accent', review: 'text-plum', blocked: 'text-muted', invalid: 'text-accent', refused: 'text-muted' }
/** Order of the groups in the preview: what needs her first. */
const ORDER: ItemAction[] = ['review', 'conflict', 'delete', 'create', 'update', 'complete', 'move', 'archive', 'blocked', 'invalid', 'refused', 'unsupported', 'unchanged']

function fmt(field: string, v: unknown): string {
  if (v === undefined || v === null || v === '') return '—'
  if (typeof v === 'number' && /Cents$/.test(field)) return (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (Array.isArray(v)) return v.join(', ')
  const s = String(v)
  return s.length > 90 ? `${s.slice(0, 90)}…` : s
}

function ItemCard({ item, choice, onChoice, onConfirm }: { item: PlanItem; choice?: string; onChoice: (v: string | undefined) => void; onConfirm: (v: boolean) => void }) {
  return (
    <li className="py-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] leading-snug">{item.title}</div>
          <div className="text-[12.5px] text-muted">
            <span className={cn('font-medium', ACTION_TONE[item.action])}>{ACTION_LABEL[item.action]}</span> · {item.typeLabel}
            {item.reason ? ` · ${item.reason}` : ''}
          </div>
        </div>
        {item.needsConfirm && <Toggle checked={!!item.confirmed} onChange={onConfirm} label={item.action === 'delete' || item.exec === 'delete' ? `Confirmar exclusão de ${item.title}` : `Usar a versão do arquivo em ${item.title}`} />}
      </div>
      {item.diffs.length > 0 && item.action !== 'unchanged' && (
        <ul className="mt-1.5 space-y-0.5">
          {item.diffs.map((d) => (
            <li key={d.field} className="text-[12.5px] text-ink-2">
              <span className="text-muted">{d.label}:</span> {item.exec === 'delete' ? `${fmt(d.field, d.before)} → apagado` : `${fmt(d.field, d.before)} → ${fmt(d.field, d.after)}`}
            </li>
          ))}
        </ul>
      )}
      {item.ignoredFields?.length ? <div className="text-[12px] text-muted mt-1">campos ignorados: {item.ignoredFields.join(', ')}</div> : null}
      {(item.action === 'review' || choice) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(item.candidates ?? []).map((c) => (
            <button key={c.id} type="button" onClick={() => onChoice(c.id)} className={cn('min-h-9 px-3 rounded-full text-[12.5px] border text-left', choice === c.id ? 'bg-ink text-bg border-ink' : 'border-line text-ink-2')}>
              vincular a “{c.title}”{c.sub ? ` · ${c.sub}` : ''}
            </button>
          ))}
          {item.op === 'create' && (
            <button type="button" onClick={() => onChoice('new')} className={cn('min-h-9 px-3 rounded-full text-[12.5px] border', choice === 'new' ? 'bg-ink text-bg border-ink' : 'border-line text-ink-2')}>
              criar novo
            </button>
          )}
          <button type="button" onClick={() => onChoice(choice === 'ignore' ? undefined : 'ignore')} className={cn('min-h-9 px-3 rounded-full text-[12.5px] border', choice === 'ignore' ? 'bg-ink text-bg border-ink' : 'border-line text-ink-2')}>
            ignorar
          </button>
          {choice && choice !== 'ignore' && (
            <button type="button" onClick={() => onChoice(undefined)} className="min-h-9 px-3 rounded-full text-[12.5px] text-muted">
              desfazer escolha
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function ChangesPreview({ doc, invalid, issues, onDone, onCancel }: { doc: ChangesDoc; invalid: Map<number, string[]>; issues: ValidationIssue[]; onDone: (line: string, batchId?: string) => void; onCancel: () => void }) {
  const db = useDB()
  const lock = useLockState()
  const [choices, setChoices] = useState<Record<number, string>>({})
  const [confirmed, setConfirmed] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [batchId] = useState(uid)
  // Recomputed from the live data: what she sees is what Confirmar will do. Nothing is written here.
  const plan = useMemo(() => planChanges(db, doc, { choices, confirmed, isLocked: lockNow(), batchId }, invalid, issues), [db, doc, choices, confirmed, invalid, issues, batchId, lock]) // eslint-disable-line react-hooks/exhaustive-deps
  const writes = plan.items.filter(willWrite).length
  const confirm = async () => {
    setBusy(true)
    try {
      const r = await importChanges(doc, { choices, confirmed, batchId })
      // A bundled weekly sync is offered once: confirmed = recorded, never offered again.
      const sync = bundledSyncOf(doc)
      if (sync) {
        markSyncApplied(sync.id)
        await persist()
      }
      haptic('success')
      const c = countPlan(r.plan)
      const pending = r.plan.items.filter((i) => i.needsConfirm && !i.confirmed).length
      const left = [pending && `${pending} sem o seu sim (nada feito)`, c.review && `${c.review} pra revisar`, c.blocked && `${c.blocked} bloqueado`, c.unsupported && `${c.unsupported} não suportado`, c.invalid + c.refused && `${c.invalid + c.refused} recusado`].filter(Boolean)
      onDone(r.written ? `Importado ✓ ${r.written} ${r.written === 1 ? 'mudança gravada' : 'mudanças gravadas'}${left.length ? ` · ${left.join(' · ')}` : ''}` : 'Nada mudou ✓ tudo já estava assim', r.batchId)
    } catch (err) {
      console.error('[marina-os] import failed', err instanceof Error ? err.message : 'unknown')
      toast('Não consegui salvar no aparelho — nada foi confirmado. Tenta de novo?')
    } finally {
      setBusy(false)
    }
  }
  const groups = ORDER.map((a) => ({ a, list: plan.items.filter((i) => i.action === a) })).filter((g) => g.list.length)
  const byType = [...plan.items.reduce((m, i) => m.set(i.typeLabel, (m.get(i.typeLabel) ?? 0) + 1), new Map<string, number>())]
  return (
    <div className="space-y-3">
      <div>
        <div className="font-display text-[17px]">{doc.source}</div>
        <div className="text-[13px] text-ink-2 mt-0.5" data-testid="changes-line">
          {planLine(plan)}
        </div>
        {byType.length > 1 && (
          <div className="text-[12.5px] text-muted mt-0.5" data-testid="changes-types">
            {byType.map(([t, n]) => `${n} ${t}`).join(' · ')}
          </div>
        )}
        {issues.map((x) => (
          <div key={x.message} className="text-[12.5px] text-muted mt-1">
            {x.message}
          </div>
        ))}
      </div>
      {groups.map((g) => (
        <div key={g.a}>
          <div className="text-[12px] uppercase tracking-wide text-muted">
            {ACTION_LABEL[g.a]} ({g.list.length})
          </div>
          <ul className="divide-y divide-line/70">
            {g.list.map((i) => (
              <ItemCard
                key={i.index}
                item={i}
                choice={choices[i.index]}
                onChoice={(v) => setChoices((c) => {
                  const next = { ...c }
                  if (v === undefined) delete next[i.index]
                  else next[i.index] = v
                  return next
                })}
                onConfirm={(v) => setConfirmed((c) => (v ? [...c, i.index] : c.filter((x) => x !== i.index)))}
              />
            ))}
          </ul>
        </div>
      ))}
      <p className="text-[12.5px] text-muted">Nada foi gravado ainda. Antes de gravar eu guardo uma cópia automática do app (dá pra voltar).</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void confirm()} disabled={busy || !writes}>
          {writes ? `Confirmar ${writes} ${writes === 1 ? 'mudança' : 'mudanças'}` : 'Nada a gravar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

type Preview =
  | { kind: 'changes'; doc: ChangesDoc; invalid: Map<number, string[]>; issues: ValidationIssue[] }
  | { kind: 'briefing'; plan: BriefingPlan; narrative: string }

export function ImportCenter({ initialText, focus }: { initialText?: string; focus?: boolean }) {
  const [text, setText] = useState(initialText ?? '')
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<{ line: string; batchId?: string }>()
  const ref = useRef<HTMLDivElement>(null)

  const read = (t: string) => {
    setResult(undefined)
    setError(undefined)
    setPreview(undefined)
    if (!t.trim()) return
    const syntax = jsonSyntaxError(t)
    if (syntax) return setError(syntax)
    if (looksLikeChanges(t)) {
      const r = parseChanges(t)
      if (!r.ok) return setError(r.error)
      return setPreview({ kind: 'changes', doc: r.doc, invalid: r.invalid, issues: r.issues })
    }
    const { blocks, narrative } = readBriefing(t)
    const plan = blocks.length ? planBriefing(getDB(), blocks) : undefined
    if (plan) return setPreview({ kind: 'briefing', plan, narrative })
    if (/"app"\s*:\s*"marina-os"/.test(t)) return setError('Isso é um backup completo — use “Backup → Importar” (ele substitui tudo).')
    setError('Não reconheci esse JSON. Aceito marina-os/changes@1 ou o bloco JSON do Daily Briefing.')
  }

  useEffect(() => {
    if (initialText) read(initialText)
    if (focus || initialText) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const done = (line: string, batchId?: string) => {
    setResult({ line, batchId })
    setPreview(undefined)
    setText('')
  }
  const undo = async (id: string) => {
    const r = undoBatch(id)
    await persist()
    setResult({ line: r.keptEdited.length ? `Importação desfeita · ${r.keptEdited.length} ficaram (você mexeu depois)` : 'Importação desfeita' })
  }

  return (
    <div ref={ref} className="scroll-mt-20" id="central">
      <Card className="space-y-3">
        {!preview && (
          <>
            <p className="text-[14px] text-ink-2 leading-snug">Cole aqui o JSON gerado pelo ChatGPT ou pelo Daily Briefing. Você revisa tudo antes de salvar.</p>
            <TextArea
              rows={10}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setError(undefined)
              }}
              placeholder="Toque aqui e escolha Colar"
              aria-label="JSON para importar"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-mono text-[13px] leading-[1.45] min-h-[220px] max-h-[50vh] overflow-auto"
            />
          </>
        )}
        {!preview && (
          <Button variant="primary" className="w-full" onClick={() => read(text)} disabled={!text.trim()}>
            Validar e ver prévia
          </Button>
        )}
        {error && (
          <p className="text-[13.5px] text-accent" role="alert">
            {error}
          </p>
        )}
        {preview?.kind === 'changes' && <ChangesPreview doc={preview.doc} invalid={preview.invalid} issues={preview.issues} onDone={done} onCancel={() => setPreview(undefined)} />}
        {preview?.kind === 'briefing' && <BriefingPreview plan={preview.plan} narrative={preview.narrative} onDone={(l) => done(l)} onCancel={() => setPreview(undefined)} />}
        {result && (
          <div className="flex items-center gap-2 text-[13px] text-ink-2" role="status">
            <span className="flex-1">{result.line}</span>
            {result.batchId && (
              <button type="button" onClick={() => void undo(result.batchId!)} className="h-9 px-3 rounded-full bg-surface-2 text-[12.5px] shrink-0">
                Desfazer
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

/** A JSON with a syntax error says where (line), so she can fix it without losing what she pasted. */
function jsonSyntaxError(t: string): string | undefined {
  const s = t.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = s.search(/[{[]/)
  if (start < 0) return 'Não achei um JSON nesse texto — ele começa com { .'
  try {
    JSON.parse(s.slice(start))
    return undefined
  } catch (e) {
    const m = /position (\d+)/.exec(e instanceof Error ? e.message : '')
    if (!m) return 'Não consegui validar o JSON. Confira se ele foi copiado inteiro (do { inicial ao } final).'
    const line = s.slice(0, start + Number(m[1])).split('\n').length
    return `Não consegui validar o JSON. Verifique a estrutura perto da linha ${line}.`
  }
}
