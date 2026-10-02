import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { removeWithUndo } from '@/app/undo'
import { actions, getDB, useDB } from '@/data/store'
import type { Book, BookStatus } from '@/data/types'
import { ChipSelect, DateInput, Field, MoreOptions, SheetLayout, TextInput, TitleInput } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { BOOK_STATUS_LABEL, bookStatusPatch } from './selectors'
import { BookCover } from './components/BookCover'

const STATUSES: BookStatus[] = ['lendo', 'proximo', 'quero', 'finalizado']

export default function BookSheet({ id, status }: SheetProps<'book'>) {
  const nav = useNavigate()
  const today = useToday()
  const existing = useDB((db) => (id ? db.books.find((b) => b.id === id) : undefined))
  const [title, setTitle] = useState(existing?.title ?? '')
  const [author, setAuthor] = useState(existing?.author ?? '')
  const [st, setSt] = useState<BookStatus>(existing?.status ?? status ?? 'quero')
  const [category, setCategory] = useState(existing?.category ?? '')
  const [coverUrl, setCoverUrl] = useState(existing?.coverUrl?.startsWith('data:') ? '' : (existing?.coverUrl ?? ''))
  const [startDate, setStartDate] = useState(existing?.startDate)
  const [endDate, setEndDate] = useState(existing?.endDate)

  const save = () => {
    const t = title.trim()
    if (!t) return
    const books = getDB().books
    const base: Book = existing ?? {
      id: '',
      createdAt: '',
      updatedAt: '',
      title: t,
      status: st,
      progress: 0,
      quotes: [],
      order: 0,
    }
    const statusChanged = !existing || existing.status !== st
    const transition: Partial<Book> = statusChanged ? bookStatusPatch({ ...base, status: existing ? existing.status : 'quero' }, st, today, books) : {}
    const fields: Partial<Book> = {
      ...transition,
      title: t,
      author: author.trim() || undefined,
      category: category.trim() || undefined,
      // keep an uploaded (data:) cover unless a URL was typed
      coverUrl: coverUrl.trim() || (existing?.coverUrl?.startsWith('data:') ? existing.coverUrl : undefined),
    }
    // dates typed by hand win over automatic ones
    const pick = (typed: string | undefined, original: string | undefined, key: 'startDate' | 'endDate') =>
      typed !== original ? typed : key in transition ? transition[key] : original
    fields.startDate = pick(startDate, existing?.startDate, 'startDate')
    fields.endDate = pick(endDate, existing?.endDate, 'endDate')

    if (existing) {
      actions.update('books', existing.id, fields)
      toast('Livro atualizado')
      closeSheet()
    } else {
      const created = actions.create('books', { progress: 0, quotes: [], order: 0, status: st, ...fields, title: t })
      toast(st === 'lendo' ? 'Boa leitura! 📖' : 'Na estante 📚', { action: { label: 'abrir', run: () => nav(ROUTES.book(created.id)) } })
      closeSheet()
    }
  }

  return (
    <SheetLayout
      title={existing ? 'Editar livro' : 'Novo livro'}
      onClose={closeSheet}
      onDelete={
        existing
          ? () => {
              removeWithUndo('books', existing.id, 'Livro removido da estante')
              closeSheet()
              if (window.location.pathname === ROUTES.book(existing.id)) nav(ROUTES.books)
            }
          : undefined
      }
      primary={{ label: existing ? 'Salvar' : 'Guardar na estante', onClick: save, disabled: !title.trim() }}
    >
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0 space-y-1">
          <TitleInput autoFocus={!existing} placeholder="Título do livro" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <input className="w-full bg-transparent outline-none text-[16px] text-ink-2 placeholder:text-muted/70 py-1" placeholder="autor(a)" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        {title.trim() && <BookCover book={{ title: title.trim(), author: author.trim(), coverUrl: coverUrl.trim() || existing?.coverUrl }} width={64} />}
      </div>
      <Field label="Status">
        <ChipSelect value={st} onChange={(v) => v && setSt(v)} options={STATUSES.map((s) => ({ value: s, label: BOOK_STATUS_LABEL[s] }))} />
      </Field>
      <MoreOptions>
        <Field label="Categoria">
          <TextInput value={category} placeholder="Produto, corrida, ficção…" onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Field label="Capa (URL)" hint="sem capa? a gente cria uma tipográfica linda pra você">
          <TextInput type="url" inputMode="url" placeholder="https://…" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Comecei em">
            <DateInput value={startDate} onChange={setStartDate} />
          </Field>
          <Field label="Terminei em">
            <DateInput value={endDate} onChange={setEndDate} />
          </Field>
        </div>
      </MoreOptions>
    </SheetLayout>
  )
}
