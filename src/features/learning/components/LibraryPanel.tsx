import { useState } from 'react'
import { toast } from '@/app/ui-store'
import { Chip, ChipSelect, EmptyState, Pill } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { LibraryStatus, StudyItem } from '@/data/types'
import { useToday } from '@/hooks/useToday'
import { haptic } from '@/lib/haptics'
import { bookLibraryStatus, LIBRARY_ORDER, libraryDistribution, libraryMarks, libraryStatusOf, markLibraryPatch } from '../engine/library'
import { domainLabel, LIBRARY_LABEL, RESOURCE_LABEL, trackDomain } from '../engine/model'

/** Biblioteca: study items + books, with statuses that are not equivalent (concluir ≠ aplicar). */
export function LibraryPanel({ domain }: { domain?: string }) {
  const db = useDB()
  const today = useToday()
  const [status, setStatus] = useState<LibraryStatus | undefined>()
  const itemDomain = (i: StudyItem) => i.domain ?? trackDomain(db.studyTracks.find((t) => t.id === i.trackId), db)
  const items = db.studyItems.filter((i) => !domain || itemDomain(i) === domain || i.relatedDomains?.includes(domain))
  const books = domain && domain !== 'literatura_escrita_cultura' ? [] : db.books
  const dist = libraryDistribution(items, books)
  const shown = status ? items.filter((i) => libraryMarks(i).has(status)) : items
  const shownBooks = status ? books.filter((b) => bookLibraryStatus(b) === status) : books

  const mark = (i: StudyItem, s: LibraryStatus) => {
    const before = { libraryStatus: i.libraryStatus, libraryLog: i.libraryLog, status: i.status, finishedAt: i.finishedAt }
    actions.update('studyItems', i.id, markLibraryPatch(i, s, today))
    haptic('light')
    toast(`${i.title}: ${LIBRARY_LABEL[s].toLowerCase()}`, { action: { label: 'Desfazer', run: () => actions.update('studyItems', i.id, before) } })
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">Concluir não é o mesmo que aprender: anotei, pratiquei e apliquei contam à parte.</p>
      <ChipSelect
        wrap={false}
        clearable
        value={status}
        onChange={setStatus}
        options={LIBRARY_ORDER.map((s) => ({ value: s, label: `${LIBRARY_LABEL[s]} · ${dist[s]}` }))}
      />
      {shown.length + shownBooks.length === 0 && <EmptyState compact title="Nada aqui ainda" text="Peça à Lumos: “guarda esse podcast na minha biblioteca: <nome ou link>”." />}
      {shown.map((i) => {
        const cur = libraryStatusOf(i)
        const marks = libraryMarks(i)
        return (
          <div key={i.id} className="rounded-2xl bg-surface border border-line p-3.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[14.5px] font-medium truncate">{i.title}</div>
                <div className="text-[12.5px] text-muted truncate">{[i.resourceType ? RESOURCE_LABEL[i.resourceType] : i.kind, domainLabel(db, itemDomain(i)), i.source].filter(Boolean).join(' · ')}</div>
              </div>
              <Pill>{LIBRARY_LABEL[cur]}</Pill>
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {LIBRARY_ORDER.filter((s) => s !== cur).map((s) => (
                <Chip key={s} className="h-8 px-3 text-[12.5px]" selected={marks.has(s)} onClick={() => mark(i, s)}>
                  {LIBRARY_LABEL[s]}
                </Chip>
              ))}
            </div>
          </div>
        )
      })}
      {shownBooks.map((b) => (
        <div key={b.id} className="rounded-2xl bg-surface border border-line p-3.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[14.5px] font-medium truncate">{b.title}</div>
            <div className="text-[12.5px] text-muted truncate">Livro{b.author ? ` · ${b.author}` : ''}</div>
          </div>
          <Pill>{LIBRARY_LABEL[bookLibraryStatus(b)]}</Pill>
        </div>
      ))}
    </div>
  )
}
