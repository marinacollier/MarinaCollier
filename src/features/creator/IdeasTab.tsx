import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp } from 'lucide-react'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { actions, nextOrder, useDB } from '@/data/store'
import { EmptyState, SwipeRow } from '@/components/ui'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { advanceContent } from './actions'
import { ideas as ideasOf } from './selectors'

export default function IdeasTab({ projectId }: { projectId?: string }) {
  const items = useDB((db) => db.contentItems)
  const list = useMemo(() => ideasOf(projectId ? items.filter((c) => c.projectId === projectId) : items), [items, projectId])
  const projects = useDB((db) => db.projects)
  const emojiOf = useMemo(() => new Map(projects.map((p) => [p.id, p.emoji])), [projects])
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const add = () => {
    const title = text.trim()
    if (!title) return
    actions.create('contentItems', { title, stage: 'ideia', projectId, links: [], order: nextOrder(items) })
    haptic('light')
    toast('Ideia guardada 💡')
    setText('')
    inputRef.current?.focus()
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="card flex items-center gap-2 pl-4 pr-1.5 py-1.5"
      >
        <span className="text-[18px]" aria-hidden>
          💡
        </span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tive uma ideia de conteúdo…"
          aria-label="Nova ideia de conteúdo"
          enterKeyHint="done"
          className="flex-1 min-w-0 bg-transparent outline-none text-[16px] h-11 placeholder:text-muted"
        />
        <button
          type="submit"
          aria-label="Guardar ideia"
          disabled={!text.trim()}
          className={cn(
            'h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition',
            text.trim() ? 'bg-ink text-bg active:scale-95' : 'bg-surface-2 text-muted',
          )}
        >
          <ArrowUp size={18} />
        </button>
      </form>

      {list.length === 0 ? (
        <EmptyState emoji="✨" title="Cabeça livre" text="Quando surgir uma ideia, joga aqui em cima. Sem pressa de organizar." />
      ) : (
        <>
          <p className="text-[12.5px] text-muted px-1 mt-4 mb-2">
            → arrasta pra Gravar · ← pra apagar · toque pra detalhar
          </p>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {list.map((c) => (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <SwipeRow
                    onComplete={() => advanceContent(c)}
                    completeLabel="Gravar"
                    onDelete={() => removeWithUndo('contentItems', c.id, 'Ideia apagada')}
                    className="card"
                  >
                    <button
                      type="button"
                      onClick={() => openSheet('content', { id: c.id })}
                      className="w-full text-left px-4 py-3.5 min-h-[52px]"
                    >
                      <div className="text-[15.5px] leading-snug">{c.title}</div>
                      {(c.category || c.format || c.hook || (!projectId && c.projectId)) && (
                        <div className="text-[13px] text-muted mt-0.5 truncate">
                          {[!projectId && c.projectId ? emojiOf.get(c.projectId) : undefined, c.category, c.format, c.hook && `“${c.hook}”`].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </button>
                  </SwipeRow>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}
