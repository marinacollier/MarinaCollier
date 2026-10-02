import { useRef, useState } from 'react'
import { Scissors } from 'lucide-react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { Button, Chip, SheetLayout } from '@/components/ui'
import { haptic } from '@/lib/haptics'
import { captureText, splitLines } from './triage'

export default function BrainDumpSheet({ text: initial }: SheetProps<'brainDump'>) {
  const [text, setText] = useState(initial ?? '')
  const [split, setSplit] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const lines = splitLines(text)
  const canSplit = lines.length > 1

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
      {canSplit ? (
        <div className="flex items-center gap-2 flex-wrap">
          <Chip selected={split} onClick={() => setSplit((v) => !v)}>
            <Scissors size={14} /> separar em {lines.length} itens
          </Chip>
          <span className="text-[12.5px] text-muted">{split ? 'um item por linha' : 'ou guardar tudo junto'}</span>
        </div>
      ) : (
        <p className="text-[13px] text-muted px-0.5">Sem categoria, sem pressa. Depois você decide o que vira tarefa, ideia, compra…</p>
      )}
    </SheetLayout>
  )
}
