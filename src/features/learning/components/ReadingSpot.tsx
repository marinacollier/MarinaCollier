import { useState } from 'react'
import { BookmarkPlus, Pencil } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { actions } from '@/data/store'
import type { Book } from '@/data/types'
import { Field, NumberInput, SheetLayout, TextInput } from '@/components/ui'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { LocalSheet } from './LocalSheet'
import { bookProgressPatch, readingWhere } from '../selectors'

/**
 * "Onde eu tô" in a book — one tap opens a tiny editor (capítulo · página · de).
 * Shows her words ("Chapter 10 — Testing Assumptions · p. 190") and never an invented percent.
 */
export function ReadingSpot({ book, className, size = 'md' }: { book: Book; className?: string; size?: 'md' | 'lg' }) {
  const [open, setOpen] = useState(false)
  const where = readingWhere(book)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={where ? `Onde estou: ${where}. Tocar para atualizar` : 'Marcar onde estou no livro'}
        className={cn('group flex items-start gap-1.5 text-left min-h-11 py-1 rounded-xl active:bg-surface-2/70 transition', className)}
      >
        {where ? (
          <>
            <span className={cn('text-ink-2 leading-snug', size === 'lg' ? 'text-[15.5px]' : 'text-[14px]')}>{where}</span>
            <Pencil size={13} className="mt-[5px] shrink-0 text-muted" />
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[14px] text-muted">
            <BookmarkPlus size={15} /> onde você está?
          </span>
        )}
      </button>
      <LocalSheet open={open} onClose={() => setOpen(false)}>
        <SpotEditor book={book} onClose={() => setOpen(false)} />
      </LocalSheet>
    </>
  )
}

function SpotEditor({ book, onClose }: { book: Book; onClose: () => void }) {
  const [chapter, setChapter] = useState(book.currentChapter ?? '')
  const [page, setPage] = useState(book.currentPage)
  const [total, setTotal] = useState(book.totalPages)
  const save = () => {
    actions.update('books', book.id, bookProgressPatch({ chapter, page, totalPages: total }))
    haptic('light')
    toast('Marcado 📖')
    onClose()
  }
  return (
    <SheetLayout eyebrow={book.title} title="Onde você está?" onClose={onClose} primary={{ label: 'Salvar', onClick: save }}>
      <Field label="Capítulo">
        <TextInput
          autoFocus
          value={chapter}
          placeholder="ex.: Chapter 10 — Testing Assumptions"
          onChange={(e) => setChapter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Página">
          <NumberInput inputMode="numeric" value={page} placeholder="190" onChange={setPage} aria-label="Página atual" />
        </Field>
        <Field label="de" hint="opcional">
          <NumberInput inputMode="numeric" value={total} placeholder="total" onChange={setTotal} aria-label="Total de páginas" />
        </Field>
      </div>
    </SheetLayout>
  )
}
