import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Camera, ChevronLeft, ImageOff, Link2, Quote, X } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { actions, useDB } from '@/data/store'
import type { Book, BookStatus } from '@/data/types'
import { Button, Card, DateInput, DeleteButton, EmptyState, IconButton, Page, ProgressBar, SectionTitle, Segmented, SheetLayout, TextArea } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { formatShortDate } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { uid } from '@/lib/id'
import { cn } from '@/lib/cn'
import { BookCover } from './components/BookCover'
import { LocalSheet } from './components/LocalSheet'
import { ProgressSlider } from './components/ProgressSlider'
import { Stars } from './components/Stars'
import { isImageUrl, resizeImageFile } from './image'
import { BOOK_STATUS_LABEL, bookStatusPatch, clampProgress } from './selectors'

const STATUS_OPTIONS: { value: BookStatus; label: string }[] = (['lendo', 'proximo', 'quero', 'finalizado'] as BookStatus[]).map((s) => ({ value: s, label: BOOK_STATUS_LABEL[s] }))

export default function BookPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const book = useDB((db) => db.books.find((b) => b.id === id))
  const back = () => (window.history.length > 1 ? nav(-1) : nav(ROUTES.books))

  if (!book) {
    return (
      <Page>
        <div className="pt-2 -mx-1.5">
          <IconButton label="Voltar" onClick={() => nav(ROUTES.books)}>
            <ChevronLeft size={24} />
          </IconButton>
        </div>
        <EmptyState emoji="📚" title="Esse livro saiu da estante" text="Talvez tenha sido apagado." action={<Button onClick={() => nav(ROUTES.books)}>ver livros</Button>} />
      </Page>
    )
  }
  return <BookDetail key={book.id} book={book} onBack={back} />
}

type Panel = 'cover' | 'rating' | null

function BookDetail({ book, onBack }: { book: Book; onBack: () => void }) {
  const nav = useNavigate()
  const today = useToday()
  const books = useDB((db) => db.books)
  const [panel, setPanel] = useState<Panel>(null)
  const update = (patch: Partial<Book>) => actions.update('books', book.id, patch)

  const changeStatus = (next: BookStatus) => {
    if (next === book.status) return
    update(bookStatusPatch(book, next, today, books))
    if (next === 'finalizado') {
      haptic('success')
      toast('Livro terminado! 🎉', { tone: 'win' })
      setPanel('rating')
    } else if (next === 'lendo') {
      haptic('light')
      toast('Boa leitura! 📖')
    }
  }

  return (
    <Page>
      <div className="flex items-center justify-between pt-2 -mx-1.5 min-h-11">
        <IconButton label="Voltar" onClick={onBack}>
          <ChevronLeft size={24} />
        </IconButton>
        <DeleteButton
          label="Apagar livro"
          onConfirm={() => {
            removeWithUndo('books', book.id, 'Livro removido da estante')
            nav(ROUTES.books, { replace: true })
          }}
        />
      </div>

      {/* hero */}
      <div className="relative -mx-4 px-4 pt-2 pb-6 flex flex-col items-center text-center overflow-hidden">
        <div className="absolute inset-x-0 top-10 h-40 bg-gradient-to-b from-surface-2 to-transparent rounded-[50%] blur-2xl opacity-80 pointer-events-none" />
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setPanel('cover')}
          className="relative"
          aria-label="Trocar capa"
        >
          <BookCover book={book} width={164} />
          <span className="absolute -bottom-2 -right-2 h-9 w-9 rounded-full bg-surface shadow-[var(--shadow)] border border-line flex items-center justify-center text-ink-2">
            <Camera size={16} />
          </span>
        </motion.button>
        <InlineText
          value={book.title}
          onSave={(v) => v && update({ title: v })}
          className="mt-6 font-display text-[28px] leading-[1.1] tracking-tight"
          placeholder="Título"
          label="Título"
        />
        <InlineText value={book.author ?? ''} onSave={(v) => update({ author: v || undefined })} className="mt-1 text-[16px] text-ink-2" placeholder="autor(a)" label="Autor" />
        <InlineText value={book.category ?? ''} onSave={(v) => update({ category: v || undefined })} className="mt-1 eyebrow" placeholder="+ categoria" label="Categoria" />
      </div>

      <Segmented value={book.status} onChange={changeStatus} options={STATUS_OPTIONS} />

      <div className="mt-4">
        {(book.status === 'quero' || book.status === 'proximo') && (
          <Button variant="accent" size="lg" onClick={() => changeStatus('lendo')}>
            comecei 📖
          </Button>
        )}
        {book.status === 'lendo' && <ReadingProgress book={book} onFinish={() => changeStatus('finalizado')} />}
        {book.status === 'finalizado' && (
          <Card className="text-center">
            <div className="eyebrow">lido {book.endDate ? `em ${formatShortDate(book.endDate)}` : ''} 🎉</div>
            <div className="flex justify-center mt-1">
              <Stars value={book.rating} onChange={(rating) => update({ rating })} size={26} />
            </div>
            {!book.rating && <div className="text-[13px] text-muted">toca nas estrelas pra avaliar</div>}
          </Card>
        )}
      </div>

      <SectionTitle>Datas</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[12.5px] text-muted mb-1 px-0.5">comecei em</span>
          <DateInput value={book.startDate} onChange={(v) => update({ startDate: v })} />
        </label>
        <label className="block">
          <span className="block text-[12.5px] text-muted mb-1 px-0.5">terminei em</span>
          <DateInput value={book.endDate} onChange={(v) => update({ endDate: v })} />
        </label>
      </div>

      <SectionTitle>Notas</SectionTitle>
      <Notes book={book} />

      <SectionTitle>Trechos favoritos</SectionTitle>
      <Quotes book={book} />

      <LocalSheet open={!!panel} onClose={() => setPanel(null)}>
        {panel === 'cover' && <CoverEditor book={book} onClose={() => setPanel(null)} />}
        {panel === 'rating' && (
          <SheetLayout eyebrow={book.title} title="Terminou! 🎉 Que tal foi?" onClose={() => setPanel(null)}>
            <div className="flex justify-center py-2">
              <Stars
                value={book.rating}
                size={34}
                onChange={(rating) => {
                  update({ rating })
                  setTimeout(() => setPanel(null), 250)
                }}
              />
            </div>
            <Button variant="ghost" block onClick={() => setPanel(null)}>
              avaliar depois
            </Button>
          </SheetLayout>
        )}
      </LocalSheet>
    </Page>
  )
}

/** Text that turns into an input on tap; saves on blur / enter. */
function InlineText({ value, onSave, className, placeholder, label }: { value: string; onSave: (v: string) => void; className?: string; placeholder: string; label: string }) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])
  if (editing) {
    return (
      <input
        ref={ref}
        aria-label={label}
        defaultValue={value}
        placeholder={placeholder}
        className={cn('w-full text-center bg-surface-2 rounded-xl outline-none px-2 py-1', className)}
        onBlur={(e) => {
          onSave(e.target.value.trim())
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <button type="button" onClick={() => setEditing(true)} aria-label={`Editar ${label.toLowerCase()}`} className={cn('max-w-full min-h-8 px-2 rounded-xl active:bg-surface-2', !value && 'text-muted/80', className)}>
      {value || placeholder}
    </button>
  )
}

function ReadingProgress({ book, onFinish }: { book: Book; onFinish: () => void }) {
  const [draft, setDraft] = useState(book.progress)
  useEffect(() => setDraft(book.progress), [book.progress])
  const commit = (v: number) => actions.update('books', book.id, { progress: clampProgress(v) })
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <div className="eyebrow">{book.startDate ? `lendo desde ${formatShortDate(book.startDate)}` : 'lendo'}</div>
        <div className="font-display text-[30px] leading-none tabular-nums">
          {clampProgress(draft)}
          <span className="text-[16px] text-muted">%</span>
        </div>
      </div>
      <ProgressBar value={draft} tone="accent" className="h-2 mt-3" />
      <ProgressSlider value={draft} onChange={setDraft} onCommit={commit} label="Progresso de leitura" />
      <div className="flex gap-2">
        <Button size="sm" variant="soft" disabled={book.progress >= 100} onClick={() => commit(book.progress + 10)}>
          +10%
        </Button>
        <Button size="sm" variant="accent" className="ml-auto" onClick={onFinish}>
          terminei 🎉
        </Button>
      </div>
    </Card>
  )
}

function Notes({ book }: { book: Book }) {
  const [text, setText] = useState(book.notes ?? '')
  return (
    <TextArea
      rows={4}
      placeholder="o que esse livro está te dizendo?"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = text.trim() || undefined
        if (v !== book.notes) actions.update('books', book.id, { notes: v })
      }}
    />
  )
}

function Quotes({ book }: { book: Book }) {
  const [text, setText] = useState('')
  const [page, setPage] = useState('')
  const quotes = useMemo(() => [...book.quotes].reverse(), [book.quotes])

  const add = () => {
    const t = text.trim()
    if (!t) return
    actions.update('books', book.id, { quotes: [...book.quotes, { id: uid(), text: t, page: page.trim() || undefined }] })
    setText('')
    setPage('')
    haptic('light')
    toast('Trecho guardado ✍️')
  }
  const remove = (qid: string) => {
    const before = book.quotes
    actions.update('books', book.id, { quotes: before.filter((q) => q.id !== qid) })
    toast('Trecho apagado', { action: { label: 'Desfazer', run: () => actions.update('books', book.id, { quotes: before }) } })
  }

  return (
    <div className="space-y-3">
      {quotes.map((q) => (
        <motion.figure key={q.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card relative pl-5 pr-11 py-4">
          <Quote size={16} className="text-accent/60 mb-1" />
          <blockquote className="font-display italic text-[17px] leading-snug whitespace-pre-wrap">{q.text}</blockquote>
          {q.page && <figcaption className="text-[12.5px] text-muted mt-2">p. {q.page}</figcaption>}
          <IconButton label="Apagar trecho" size="sm" className="absolute top-1.5 right-1.5" onClick={() => remove(q.id)}>
            <X size={15} />
          </IconButton>
        </motion.figure>
      ))}
      <div className="card p-3 space-y-2">
        <TextArea rows={2} placeholder="um trecho que ficou com você…" value={text} onChange={(e) => setText(e.target.value)} className="bg-transparent px-1" />
        <div className="flex gap-2 items-center">
          <input className="input w-24 py-2" inputMode="numeric" placeholder="página" value={page} onChange={(e) => setPage(e.target.value)} aria-label="Página (opcional)" />
          <Button size="sm" variant="primary" className="ml-auto" disabled={!text.trim()} onClick={add}>
            guardar trecho
          </Button>
        </div>
      </div>
    </div>
  )
}

function CoverEditor({ book, onClose }: { book: Book; onClose: () => void }) {
  const [url, setUrl] = useState(book.coverUrl && !book.coverUrl.startsWith('data:') ? book.coverUrl : '')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const setCover = (coverUrl: string | undefined, msg: string) => {
    actions.update('books', book.id, { coverUrl })
    toast(msg)
    onClose()
  }

  return (
    <SheetLayout title="Capa" eyebrow={book.title} onClose={onClose}>
      <div className="flex justify-center py-1">
        <BookCover book={{ ...book, coverUrl: isImageUrl(url) ? url : book.coverUrl }} width={112} />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          try {
            const dataUrl = await resizeImageFile(file, 360)
            setCover(dataUrl, 'Capa nova 📸')
          } catch {
            toast('Não consegui ler essa imagem, tenta outra?')
          } finally {
            setBusy(false)
          }
        }}
      />
      <Button variant="primary" size="lg" icon={<Camera size={18} />} disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? 'preparando…' : 'escolher foto'}
      </Button>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (isImageUrl(url)) setCover(url.trim(), 'Capa atualizada')
        }}
      >
        <div className="relative flex-1">
          <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" type="url" inputMode="url" placeholder="ou cola o link da imagem" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <Button type="submit" variant="soft" className="h-12 rounded-2xl" disabled={!isImageUrl(url)}>
          usar
        </Button>
      </form>
      {book.coverUrl && (
        <Button variant="ghost" block icon={<ImageOff size={16} />} onClick={() => setCover(undefined, 'Voltou pra capa tipográfica')}>
          usar capa tipográfica
        </Button>
      )}
    </SheetLayout>
  )
}
