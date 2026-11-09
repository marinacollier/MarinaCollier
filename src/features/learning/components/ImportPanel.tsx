import { useState } from 'react'
import { toast } from '@/app/ui-store'
import { Button, SheetLayout, TextArea } from '@/components/ui'
import { actions, getDB } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { previewImport, type ImportPreview } from '../engine/import'

/** JSON import of external sessions / review cards: preview first, dedupe by id, then one tap. */
export function ImportPanel({ onClose }: { onClose: () => void }) {
  const today = useToday()
  const [raw, setRaw] = useState('')
  const [preview, setPreview] = useState<ImportPreview | undefined>()
  const apply = () => {
    if (!preview) return
    const s = actions.createMany('studySessions', preview.sessions)
    const c = actions.createMany('learningErrors', preview.cards)
    toast(`Importado: ${s.length} sessões, ${c.length} cartões ✓`, {
      action: {
        label: 'Desfazer',
        run: () => {
          s.forEach((x) => actions.remove('studySessions', x.id))
          c.forEach((x) => actions.remove('learningErrors', x.id))
        },
      },
    })
    onClose()
  }
  const total = preview ? preview.sessions.length + preview.cards.length : 0
  return (
    <SheetLayout title="Importar histórico" eyebrow="JSON" onClose={onClose} primary={preview ? { label: `Importar ${total}`, onClick: apply, disabled: !total } : { label: 'Ver prévia', onClick: () => setPreview(previewImport(getDB(), raw, today)), disabled: !raw.trim() }}>
      <p className="text-[13px] text-muted mb-2">
        Cole {'{ "sessions": [...], "cards": [...] }'}. Cada registro precisa de um <code>id</code> estável: o mesmo id nunca entra duas vezes.
      </p>
      <TextArea value={raw} onChange={(e) => (setRaw(e.target.value), setPreview(undefined))} rows={8} aria-label="JSON para importar" />
      {preview && (
        <div className="mt-3 text-[13.5px] space-y-1" aria-label="Prévia da importação">
          <div>
            {preview.sessions.length} sessões novas · {preview.cards.length} cartões novos
          </div>
          {preview.skipped.length > 0 && <div className="text-muted">Já existem (ignorados): {preview.skipped.map((s) => s.id).join(', ')}</div>}
          {preview.invalid.map((m) => (
            <div key={m} className="text-accent">
              {m}
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setPreview(undefined)}>
            Editar
          </Button>
        </div>
      )}
    </SheetLayout>
  )
}
