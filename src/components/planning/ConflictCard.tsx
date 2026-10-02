import { AlertTriangle, Info } from 'lucide-react'
import { actions } from '@/data/store'
import type { Conflict } from '@/data/planning'
import { toast } from '@/app/ui-store'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'

export interface ConflictCardProps {
  conflict: Conflict
  /** "Mover treino" — the caller decides how (open the workout sheet, start a drag...). Hidden when absent. */
  onMove?: () => void
  compact?: boolean
  className?: string
}

/**
 * A detected conflict with Marina's three choices. Never deletes or moves anything by itself:
 * "Manter assim" / "Ignorar" store a ConflictAck so it stops showing up.
 */
export function ConflictCard({ conflict, onMove, compact, className }: ConflictCardProps) {
  const warn = conflict.severity === 'warn'
  const ack = (decision: 'manter' | 'ignorar') => {
    actions.create('conflictAcks', { key: conflict.key, decision, date: conflict.date })
    toast(decision === 'manter' ? 'Combinado, fica assim ✓' : 'Ok, não aviso mais sobre isso')
  }
  return (
    <div className={cn('rounded-2xl p-3.5', warn ? 'bg-sand-soft' : 'bg-surface-2', className)} role="status">
      <div className="flex gap-2.5">
        {warn ? <AlertTriangle size={17} className="text-sand shrink-0 mt-0.5" /> : <Info size={17} className="text-muted shrink-0 mt-0.5" />}
        <div className="min-w-0">
          <div className="text-[14px] leading-snug">{conflict.message.replace(/^⚠️\s*/, '')}</div>
          {!compact && <div className="text-[12px] text-muted mt-0.5">{conflict.title}</div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2.5 pl-7">
        {onMove && (
          <Button size="sm" variant="primary" onClick={onMove}>
            Mover treino
          </Button>
        )}
        <Button size="sm" variant="soft" onClick={() => ack('manter')}>
          Manter assim
        </Button>
        <Button size="sm" variant="ghost" onClick={() => ack('ignorar')}>
          Ignorar
        </Button>
      </div>
    </div>
  )
}
