import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GraduationCap, Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { actions, useDB } from '@/data/store'
import type { Book } from '@/data/types'
import { Button, Card, EmptyState, IconButton, Page, PageHeader, ProgressBar, SectionTitle, SortableList } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { formatShortDate } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { pluralize } from '@/lib/text'
import { BookCover } from './components/BookCover'
import { Stars } from './components/Stars'
import { bookStatusPatch, booksByStatus, finishedByYear } from './selectors'

function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

export default function BooksPage() {
  const nav = useNavigate()
  const today = useToday()
  const books = useDB((db) => db.books)
  const reading = useMemo(() => booksByStatus(books, 'lendo'), [books])
  const upNext = useMemo(() => booksByStatus(books, 'proximo'), [books])
  const wishlist = useMemo(() => booksByStatus(books, 'quero'), [books])
  const finished = useMemo(() => finishedByYear(books), [books])
  const year = today.slice(0, 4)
  const readThisYear = finished.find((g) => g.year === year)?.books.length ?? 0

  const start = (b: Book) => {
    actions.update('books', b.id, bookStatusPatch(b, 'lendo', today, books))
    haptic('light')
    toast(`Boa leitura! ${b.title} 📖`)
  }
  const open = (b: Book) => nav(ROUTES.book(b.id))

  return (
    <Page>
      <PageHeader
        eyebrow="mente"
        title="Livros"
        subtitle={readThisYear ? `${pluralize(readThisYear, 'livro lido', 'livros lidos')} em ${year} 📚` : 'sua estante, no seu ritmo.'}
        actions={
          <>
            <IconButton label="Estudos" onClick={() => nav(ROUTES.study)}>
              <GraduationCap size={20} />
            </IconButton>
            <IconButton label="Novo livro" onClick={() => openSheet('book', { status: 'quero' })}>
              <Plus size={22} />
            </IconButton>
          </>
        }
      />

      <SectionTitle className="mt-1">Lendo agora</SectionTitle>
      {reading.length ? (
        <div className="space-y-3">
          {reading.map((b, i) => (
            <motion.div key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card onPress={() => open(b)} className="flex gap-4 p-4">
                <BookCover book={b} width={112} />
                <div className="flex-1 min-w-0 flex flex-col py-1">
                  <div className="font-display text-[22px] leading-[1.1] tracking-tight">{b.title}</div>
                  {b.author && <div className="text-[14px] text-muted mt-1">{b.author}</div>}
                  <div className="mt-auto pt-4">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-[12.5px] text-muted">{b.startDate ? `desde ${formatShortDate(b.startDate)}` : 'lendo'}</span>
                      <span className="font-display text-[18px] tabular-nums">{b.progress}%</span>
                    </div>
                    <ProgressBar value={b.progress} tone="accent" className="h-2" />
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="p-0">
          <EmptyState compact emoji="📚" title="Nenhum livro aberto agora." text="Que tal o próximo? 📖" className="pb-3" />
          {upNext[0] && (
            <div className="flex items-center gap-3 mx-4 mb-4 p-3 rounded-2xl bg-surface-2">
              <BookCover book={upNext[0]} width={44} />
              <button type="button" className="flex-1 min-w-0 text-left" onClick={() => open(upNext[0])}>
                <div className="text-[15px] font-medium truncate">{upNext[0].title}</div>
                {upNext[0].author && <div className="text-[12.5px] text-muted truncate">{upNext[0].author}</div>}
              </button>
              <Button size="sm" variant="accent" onClick={() => start(upNext[0])}>
                comecei
              </Button>
            </div>
          )}
        </Card>
      )}

      <SectionTitle
        action={
          <AddLink onClick={() => openSheet('book', { status: 'proximo' })}>adicionar</AddLink>
        }
      >
        Próximos
      </SectionTitle>
      {upNext.length ? (
        <SortableList
          items={upNext}
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
      ) : (
        <p className="text-[14px] text-muted px-1">Nenhum na fila. Escolhe um da lista “quero ler” quando der.</p>
      )}

      <SectionTitle action={<AddLink onClick={() => openSheet('book', { status: 'quero' })}>adicionar</AddLink>}>Quero ler</SectionTitle>
      <Shelf books={wishlist} onOpen={open} onAdd={() => openSheet('book', { status: 'quero' })} />

      <SectionTitle>Finalizados</SectionTitle>
      {finished.length ? (
        <div className="space-y-5">
          {finished.map((g) => (
            <div key={g.year}>
              <div className="flex items-baseline gap-2 px-1 mb-2">
                <span className="font-display text-[24px] leading-none">{g.year}</span>
                <span className="text-[13px] text-muted">{pluralize(g.books.length, 'livro', 'livros')}</span>
              </div>
              <div className="card overflow-hidden divide-y divide-line/70">
                {g.books.map((b) => (
                  <button key={b.id} type="button" onClick={() => open(b)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
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
      ) : (
        <p className="text-[14px] text-muted px-1">Os livros que você terminar aparecem aqui, com estrelinhas. ✨</p>
      )}
    </Page>
  )
}

function AddLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-[13px] text-muted h-8 -mb-1.5 px-1 inline-flex items-center gap-1">
      <Plus size={14} /> {children}
    </button>
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
