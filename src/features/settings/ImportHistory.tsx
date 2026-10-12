/**
 * Daily Briefing in Dados: paste the JSON → preview after reconciliation (new to-dos · existing ones it
 * updates/links · future · waiting · recurring · review) → Confirmar → the persisted result.
 * Then a light history: date · what came in · Desfazer for one not undone.
 * Undo reverts only what is still as that import left it (her later changes stay).
 */
import { useState } from 'react'
import { toast } from '@/app/ui-store'
import { Button, Card, SectionTitle, TextArea } from '@/components/ui'
import { applyPlan, undoBatch } from '@/data/briefing/apply'
import { HOW_LABEL, planBriefing, readBriefing, resultLine, type BriefingPlan, type PlanEntry } from '@/data/briefing/import'
import { getDB, persist, useDB } from '@/data/store'
import { formatDayMonth } from '@/lib/date'
import { haptic } from '@/lib/haptics'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const GROUPS: { title: string; pick: (e: PlanEntry) => boolean }[] = [
  { title: 'Novas tarefas de hoje', pick: (e) => e.kind === 'today' && e.how === 'created' },
  { title: 'Já existentes (atualiza / vincula)', pick: (e) => e.kind === 'today' && e.how !== 'created' },
  { title: 'Próximos', pick: (e) => e.kind === 'future' },
  { title: 'Waiting For', pick: (e) => e.kind === 'waiting' },
  { title: 'Recorrências', pick: (e) => e.kind === 'recurring' },
]

function BriefingPaste() {
  const [text, setText] = useState('')
  const [plan, setPlan] = useState<{ plan: BriefingPlan; narrative: string }>()
  const [result, setResult] = useState<string>()
  const preview = () => {
    const { blocks, narrative } = readBriefing(text)
    const p = blocks.length ? planBriefing(getDB(), blocks) : undefined
    setResult(undefined)
    if (!p) return toast('Não achei o bloco JSON do briefing nesse texto.')
    setPlan({ plan: p, narrative })
  }
  const confirm = async () => {
    if (!plan) return
    if (plan.plan.ops.length) applyPlan(plan.plan, plan.narrative)
    const saved = await persist()
    if (!saved.ok) return toast('Não consegui salvar no aparelho — nada foi confirmado.')
    haptic('success')
    setResult(plan.plan.ops.length ? `Importado ✓ ${resultLine(plan.plan)}` : 'Tudo isso já estava no app ✓ nada duplicado')
    setPlan(undefined)
    setText('')
  }
  return (
    <Card className="space-y-3">
      <TextArea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Cola aqui o Daily Executive Briefing (com o bloco JSON)" aria-label="Daily Briefing" />
      {!plan && (
        <Button size="sm" variant="soft" onClick={preview} disabled={!text.trim()}>
          Ver prévia
        </Button>
      )}
      {plan && (
        <div className="space-y-3">
          <div className="text-[13px] text-muted">
            Daily Briefing · {formatDayMonth(plan.plan.date)} — {resultLine(plan.plan)}
          </div>
          {GROUPS.map((g) => {
            const list = plan.plan.entries.filter(g.pick)
            if (!list.length) return null
            return (
              <div key={g.title}>
                <div className="text-[12px] uppercase tracking-wide text-muted">{g.title}</div>
                <ul className="mt-1 space-y-1">
                  {list.map((e) => (
                    <li key={`${e.kind}-${e.title}`} className="text-[14px]">
                      {e.title}
                      <span className="text-[12.5px] text-muted"> — {[HOW_LABEL[e.how], e.sub].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          {plan.plan.review.length > 0 && (
            <div>
              <div className="text-[12px] uppercase tracking-wide text-muted">Precisa de revisão</div>
              <ul className="mt-1 space-y-1">
                {plan.plan.review.map((r) => (
                  <li key={r.title + r.reason} className="text-[14px]">
                    {r.title}
                    <span className="text-[12.5px] text-muted"> — {r.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void confirm()}>
              Confirmar importação
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPlan(undefined)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {result && <div className="text-[13px] text-ink-2">{result}</div>}
    </Card>
  )
}

export function ImportHistory() {
  const batches = useDB((db) => db.importBatches)
  const list = [...batches].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, 10)
  const undo = (id: string) => {
    const r = undoBatch(id)
    void persist()
    haptic('light')
    toast(r.keptEdited.length ? `Importação desfeita · ${plural(r.keptEdited.length, 'item ficou', 'itens ficaram')} (você mexeu depois)` : 'Importação desfeita')
  }
  return (
    <>
      <SectionTitle>Daily Briefing</SectionTitle>
      <BriefingPaste />
      {list.length > 0 && (
        <>
          <SectionTitle>Importações do briefing</SectionTitle>
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-line/70">
              {list.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 min-h-[56px] py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px]">
                      {b.source} · {formatDayMonth(b.briefingDate)}
                    </div>
                    <div className="text-[12.5px] text-muted">
                      {[plural(b.counts.created, 'criado', 'criados'), plural(b.counts.updated, 'atualizado', 'atualizados'), plural(b.counts.ignored, 'já estava', 'já estavam'), b.counts.reviewRequired ? plural(b.counts.reviewRequired, 'pra revisar', 'pra revisar') : undefined].filter(Boolean).join(' · ')}
                      {b.undoneAt ? ' · desfeita' : ''}
                    </div>
                  </div>
                  {!b.undoneAt && (
                    <button type="button" onClick={() => undo(b.id)} className="h-9 px-3 rounded-full bg-surface-2 text-[12.5px] text-ink-2 shrink-0 active:scale-95 transition">
                      Desfazer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  )
}
