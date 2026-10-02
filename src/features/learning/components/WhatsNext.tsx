import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { actions, nextOrder, useDB } from '@/data/store'
import type { StudyItem } from '@/data/types'
import { Button, SheetLayout } from '@/components/ui'
import { SubmitIcon } from './SubmitIcon'
import { haptic } from '@/lib/haptics'
import { promoteToNextPatch, promotionCandidates, startStudyPatch } from '../selectors'

/**
 * "E depois?" — shown right after finishing a study, so the next one is never lost.
 * Tap a row → it becomes the próximo estudo. "começar" → straight to estudando.
 */
export function WhatsNext({ finished, onDone }: { finished: Pick<StudyItem, 'id' | 'title' | 'trackId'>; onDone: () => void }) {
  const items = useDB((db) => db.studyItems)
  const tracks = useDB((db) => db.studyTracks)
  const candidates = useMemo(() => promotionCandidates(items, finished), [items, finished])
  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])
  const [text, setText] = useState('')

  const promote = (it: StudyItem) => {
    actions.update('studyItems', it.id, promoteToNextPatch(items))
    haptic('light')
    toast(`Anotado: “${it.title}” é o próximo ✨`)
    onDone()
  }
  const start = (it: StudyItem) => {
    actions.update('studyItems', it.id, { ...startStudyPatch(it), order: nextOrder(items.filter((i) => i.status === 'estudando')) })
    haptic('light')
    toast(`Bora: ${it.title} 📚`)
    onDone()
  }
  const addNew = () => {
    const title = text.trim()
    if (!title) return
    const order = promoteToNextPatch(items).order ?? 0
    actions.create('studyItems', { title, kind: 'tema', trackId: finished.trackId, progress: 0, status: 'proximo', order })
    haptic('light')
    toast('Guardado como próximo estudo ✨')
    onDone()
  }

  return (
    <SheetLayout eyebrow={`terminou: ${finished.title}`} title="Que orgulho! E depois? 🎉" onClose={onDone}>
      <p className="text-[14px] text-muted">Escolhe o que vem agora, assim nada se perde no caminho.</p>
      {candidates.length > 0 && (
        <div className="card overflow-hidden divide-y divide-line/70">
          {candidates.map((it, i) => {
            const tr = it.trackId ? trackById.get(it.trackId) : undefined
            return (
              <motion.div key={it.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="flex items-center gap-2 pr-2">
                <button type="button" onClick={() => promote(it)} className="flex-1 min-w-0 flex items-center gap-3 min-h-[56px] py-2.5 pl-4 text-left active:bg-surface-2">
                  <span className="text-[20px] w-7 text-center shrink-0" aria-hidden>
                    {tr?.emoji ?? '📚'}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] leading-snug truncate">{it.title}</span>
                    <span className="block text-[12.5px] text-muted">
                      {it.status === 'proximo' ? 'na fila' : 'do backlog'}
                      {tr ? ` · ${tr.name}` : ''}
                    </span>
                  </span>
                </button>
                <Button size="sm" variant="soft" icon={<Play size={13} />} onClick={() => start(it)} aria-label={`Começar ${it.title} agora`}>
                  começar
                </Button>
              </motion.div>
            )
          })}
        </div>
      )}
      <div>
        <div className="eyebrow px-1 mb-2">{candidates.length ? 'ou algo novo' : 'sua fila está livre — o que vem agora?'}</div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addNew()
          }}
        >
          <input className="input flex-1" placeholder="ex.: curso de IA, tema de inglês…" value={text} onChange={(e) => setText(e.target.value)} autoFocus={!candidates.length} />
          <SubmitIcon label="Guardar como próximo" disabled={!text.trim()} />
        </form>
      </div>
      <Button variant="ghost" block onClick={onDone}>
        agora não, depois eu vejo
      </Button>
    </SheetLayout>
  )
}
