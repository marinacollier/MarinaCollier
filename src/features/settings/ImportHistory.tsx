/**
 * Light history of Daily Briefing imports (Dados): date · what came in · Desfazer for one not undone.
 * Undo reverts only what is still as that import left it (her later changes stay).
 */
import { toast } from '@/app/ui-store'
import { Card, SectionTitle } from '@/components/ui'
import { undoBatch } from '@/data/briefing/apply'
import { persist, useDB } from '@/data/store'
import { formatDayMonth } from '@/lib/date'
import { haptic } from '@/lib/haptics'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function ImportHistory() {
  const batches = useDB((db) => db.importBatches)
  if (!batches.length) return null
  const list = [...batches].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, 10)
  const undo = (id: string) => {
    const r = undoBatch(id)
    void persist()
    haptic('light')
    toast(r.keptEdited.length ? `Importação desfeita · ${plural(r.keptEdited.length, 'item ficou', 'itens ficaram')} (você mexeu depois)` : 'Importação desfeita')
  }
  return (
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
  )
}
