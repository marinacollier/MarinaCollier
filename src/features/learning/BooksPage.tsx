import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { actions, useDB } from '@/data/store'
import type { Book } from '@/data/types'
import { Button, IconButton, Page, PageHeader, ProgressBar, SectionTitle, SortableList } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { formatShortDate } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { pluralize } from '@/lib/text'
import { BookCover } from './components/BookCover'
import { Stars } from './components/Stars'
import { ReadingSpot } from './components/ReadingSpot'
import { bookStatusPatch, finishedByYear, libraryShelves } from './selectors'

function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

export default function BooksPage() {
  const nav = useNavigate()
  const today = useToday()
  const books = useDB((db) => db.books)
  const shelves = useMemo(() => libraryShelves(books), [books])
  const year = today.slice(0, 4)
  const readThisYear = useMemo(() => books.filter((b) => b.status === 'finalizado' && b.endDate?.startsWith(year)).length, [books, year])

  const start = (b: Book) => {
    actions.update('books', b.id, bookStatusPatch(b, 'lendo', today, books))
    haptic('light')
    toast(`Boa leitura! ${b.title} 📖`)
  }
  const finish = (b: Book) => {
    const before = { status: b.status, endDate: b.endDate, progress: b.progress, startDate: b.startDate, order: b.order }
    actions.update('books', b.id, bookStatusPatch(b, 'finalizado', today, books))
    haptic('success')
    toast(`Terminou ${b.title}! 🎉`, { tone: 'win', action: { label: 'Desfazer', run: () => actions.update('books', b.id, before) } })
  }
  const open = (b: Book) => nav(ROUTES.book(b.id))

  return (
    <Page>
      <PageHeader
        eyebrow="aprender"
        title="Livros"
        subtitle={readThisYear ? `${pluralize(readThisYear, 'livro lido', 'livros lidos')} em ${year} 📚` : 'sua estante, no seu ritmo.'}
        actions={
          <IconButton label="Novo livro" onClick={() => openSheet('book', { status: 'quero' })}>
            <Plus size={22} />
          </IconButton>
        }
      />

      {shelves.length === 0 ? (
        <EmptyLibrary />
      ) : (
        shelves.map((shelf, si) => (
          <section key={shelf.status} aria-label={shelf.label}>
            <SectionTitle className={si === 0 ? 'mt-1' : undefined}>{shelf.label}</SectionTitle>
            {shelf.status === 'lendo' && (
              <div className="space-y-3">
                {shelf.books.map((b, i) => (
                  <ReadingNow key={b.id} book={b} delay={i * 0.05} onOpen={() => open(b)} onFinish={() => finish(b)} />
                ))}
              </div>
            )}
            {shelf.status === 'proximo' && (
              <SortableList
                items={shelf.books}
                className="space-y-2"
                onReorder={(ids) => actions.reorder('books', ids)}
                renderItem={(b, handle) => (
                  <div className="card flex items-center gap-3 pl-1 pr-3 py-2.5">
                    {handle}
                    <BookCover book={b} width={40} />
                    <button type="button" className="flex-1 min-w-0 text-left" onClick={() => open(b)}>
                      <span className="block text-[15px] font-medium truncate">{b.title}</span>
                      {b.author && <span className="block text-[12.5px] text-muted truncate">{b.author}</span>}
                    </button>
                    <Button size="sm" variant="soft" onClick={() => start(b)}>
                      comecei
                    </Button>
                  </div>
                )}
              />
            )}
            {shelf.status === 'quero' && <Shelf books={shelf.books} onOpen={open} onAdd={() => openSheet('book', { status: 'quero' })} />}
            {shelf.status === 'finalizado' && <FinishedList books={shelf.books} onOpen={open} />}
          </section>
        ))
      )}
    </Page>
  )
}

/** The book she's reading: big jacket, title, where she is (one tap to update), "terminei". */
function ReadingNow({ book, delay, onOpen, onFinish }: { book: Book; delay: number; onOpen: () => void; onFinish: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="card p-4">
      <div className="flex gap-4">
        <button type="button" onClick={onOpen} aria-label={`Abrir ${book.title}`} className="shrink-0 active:scale-[0.98] transition">
          <BookCover book={book} width={116} />
        </button>
        <div className="flex-1 min-w-0 flex flex-col pt-1">
          <button type="button" onClick={onOpen} className="text-left">
            <span className="block font-display text-[23px] leading-[1.08] tracking-tight">{book.title}</span>
            {book.author && <span className="block text-[14px] text-muted mt-1.5">{book.author}</span>}
          </button>
          <div className="mt-auto pt-3">
            <div className="eyebrow mb-0.5">onde estou</div>
            <ReadingSpot book={book} className="-mx-1 px-1" />
          </div>
        </div>
      </div>
      {book.progress > 0 && <ProgressBar value={book.progress} tone="accent" className="h-1.5 mt-3" />}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-[12.5px] text-muted">{book.startDate ? `desde ${formatShortDate(book.startDate)}` : ''}</span>
        <Button size="sm" variant="soft" className="ml-auto" onClick={onFinish}>
          terminei 🎉
        </Button>
      </div>
    </motion.div>
  )
}

function FinishedList({ books, onOpen }: { books: Book[]; onOpen: (b: Book) => void }) {
  const groups = useMemo(() => finishedByYear(books), [books])
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.year}>
          <div className="flex items-baseline gap-2 px-1 mb-2">
            <span className="font-display text-[24px] leading-none">{g.year}</span>
            <span className="text-[13px] text-muted">{pluralize(g.books.length, 'livro', 'livros')}</span>
          </div>
          <div className="card overflow-hidden divide-y divide-line/70">
            {g.books.map((b) => (
              <button key={b.id} type="button" onClick={() => onOpen(b)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                <BookCover book={b} width={40} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium truncate">{b.title}</span>
                  {b.author && <span className="block text-[12.5px] text-muted truncate">{b.author}</span>}
                  <span className="flex items-center gap-2 mt-1">
                    <Stars value={b.rating} size={12} />
                    {b.endDate && <span className="text-[12px] text-muted">{formatShortDate(b.endDate)}</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** First visit: no invented books — an empty shelf waiting for her first one. */
function EmptyLibrary() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card px-5 pt-7 pb-5 mt-1 text-center">
      <div className="flex items-end justify-center gap-2.5 px-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="rounded-[3px_8px_8px_3px] border border-dashed border-line"
            style={{ width: 54, height: i === 1 ? 84 : 76, transform: i === 2 ? 'rotate(4deg) translateX(-2px)' : undefined }}
          />
        ))}
      </div>
      <div className="h-2 rounded-[3px] bg-line shadow-[0_8px_12px_-6px_rgb(60_40_20/0.35)] mx-6" aria-hidden />
      <div className="font-display text-[24px] leading-tight mt-6">Sua estante começa aqui</div>
      <p className="text-[14.5px] text-muted mt-1.5 max-w-[290px] mx-auto">
        Do teu jeito: só entram os livros que você colocar. Viu um que parece massa? Guarda aqui. 📖
      </p>
      <div className="flex justify-center gap-2 mt-5">
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => openSheet('book', { status: 'quero' })}>
          quero ler
        </Button>
        <Button size="sm" variant="soft" onClick={() => openSheet('book', { status: 'lendo' })}>
          estou lendo
        </Button>
      </div>
    </motion.div>
  )
}

const SHELF_COVER = 100

/** Covers standing on wooden-ish planks, three per shelf. */
function Shelf({ books, onOpen, onAdd }: { books: Book[]; onOpen: (b: Book) => void; onAdd: () => void }) {
  const slots: (Book | 'add')[] = [...books, 'add']
  return (
    <div className="space-y-6">
      {chunk(slots, 3).map((row, r) => (
        <div key={r}>
          <div className="grid grid-cols-3 gap-3 items-end px-1">
            {row.map((b, i) =>
              b === 'add' ? (
                <button
                  key="add"
                  type="button"
                  onClick={onAdd}
                  aria-label="Adicionar livro à lista"
                  className="justify-self-center rounded-[3px_8px_8px_3px] border border-dashed border-line text-muted flex flex-col items-center justify-center gap-1 text-[12px] active:scale-[0.98] transition"
                  style={{ width: SHELF_COVER, height: SHELF_COVER * 1.5 }}
                >
                  <Plus size={18} />
                  quero ler
                </button>
              ) : (
                <motion.button
                  key={b.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (r * 3 + i) * 0.04 }}
                  whileTap={{ scale: 0.97, y: -2 }}
                  onClick={() => onOpen(b)}
                  className="justify-self-center"
                >
                  <BookCover book={b} width={SHELF_COVER} />
                </motion.button>
              ),
            )}
          </div>
          <div className="h-2.5 rounded-[3px] bg-line shadow-[0_8px_12px_-6px_rgb(60_40_20/0.35)]" />
          <div className="grid grid-cols-3 gap-3 px-1 mt-2.5 items-start">
            {row.map((b) =>
              b === 'add' ? (
                <span key="add" />
              ) : (
                <button key={b.id} type="button" onClick={() => onOpen(b)} className="text-left min-w-0 justify-self-center" style={{ width: SHELF_COVER }}>
                  <span className="block text-[12.5px] font-medium leading-tight line-clamp-2">{b.title}</span>
                  {b.author && <span className="block text-[11.5px] text-muted truncate mt-0.5">{b.author}</span>}
                </button>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
