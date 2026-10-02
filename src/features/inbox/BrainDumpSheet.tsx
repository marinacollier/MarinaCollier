import { useMemo, useRef, useState } from 'react'
import { Scissors, Sparkles } from 'lucide-react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { Button, Chip, SheetLayout } from '@/components/ui'
import { haptic } from '@/lib/haptics'
import { useDB } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { captureText, splitLines } from './triage'
import { captureWithIntent, INTENT_DONE, suggestionFor } from './nl'
import { openCreated } from './open'

export default function BrainDumpSheet({ text: initial }: SheetProps<'brainDump'>) {
  const [text, setText] = useState(initial ?? '')
  const [split, setSplit] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const lines = splitLines(text)
  const canSplit = lines.length > 1
  const db = useDB()
  const today = useToday()
  const intent = useMemo(() => (canSplit ? undefined : suggestionFor(db, text, today)), [db, text, today, canSplit])

  const accept = () => {
    if (!intent) return
    const res = captureWithIntent(text, intent, today)
    if (!res) return
    haptic('success')
    toast(INTENT_DONE[intent.type], { action: { label: 'Abrir', run: () => openCreated(res.type, res.id) } })
    closeSheet()
  }

  const save = (again: boolean) => {
    const n = captureText(text, split && canSplit)
    if (!n) return
    haptic('success')
    toast(n > 1 ? `${n} itens guardados ✓` : 'Guardado ✓ — organiza depois')
    if (again) {
      setText('')
      setSplit(false)
      ref.current?.focus()
    } else closeSheet()
  }

  return (
    <SheetLayout
      eyebrow="Brain dump"
      title="Tirar isso da cabeça"
      onClose={closeSheet}
      primary={{ label: split && canSplit ? `Guardar ${lines.length} itens` : 'Guardar', onClick: () => save(false), disabled: !text.trim() }}
      footerExtra={
        <Button variant="ghost" size="md" className="px-3 text-[14px]" disabled={!text.trim()} onClick={() => save(true)}>
          + outro
        </Button>
      }
    >
      <textarea
        ref={ref}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escreve do jeito que vier. Pode colar uma lista inteira."
        rows={7}
        className="w-full bg-surface-2 rounded-2xl p-4 outline-none resize-none leading-relaxed text-[17px] placeholder:text-muted/80 border border-transparent focus:border-accent/40 transition-colors min-h-[180px]"
      />
      {intent && (
        <button
          type="button"
          onClick={accept}
          className="w-full flex items-center gap-2.5 rounded-2xl bg-accent-soft pl-4 pr-2 min-h-[52px] text-left active:scale-[0.99] transition"
        >
          <Sparkles size={16} className="text-accent shrink-0" />
          <span className="flex-1 min-w-0 text-[14.5px] leading-snug">
            <span className="text-muted">Parece: </span>
            {intent.label}
          </span>
          <span className="h-9 px-3 rounded-full bg-surface text-[13px] font-medium inline-flex items-center shrink-0">criar?</span>
        </button>
      )}
      {canSplit ? (
        <div className="flex items-center gap-2 flex-wrap">
          <Chip selected={split} onClick={() => setSplit((v) => !v)}>
            <Scissors size={14} /> separar em {lines.length} itens
          </Chip>
          <span className="text-[12.5px] text-muted">{split ? 'um item por linha' : 'ou guardar tudo junto'}</span>
        </div>
      ) : (
        <p className="text-[13px] text-muted px-0.5">{intent ? 'Ou só guarda — dá pra decidir depois.' : 'Tá tudo aí. Não precisa ficar na tua cabeça.'}</p>
      )}
    </SheetLayout>
  )
}
