/** Biblioteca: busca (título, temas, trechos, texto), filtros (status, gênero, tema, coleção) e ordenação. */
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { EmptyState, Segmented, Select } from '@/components/ui'
import { useDB } from '@/data/store'
import type { LiteraryStatus } from '@/data/types'
import { filterWorks, genresOf, latestVersion, STATUS_LABEL, STATUS_ORDER, tagCounts, type LibrarySort } from '../model'
import { WorkCard } from '../parts'

const SORTS: { value: LibrarySort; label: string }[] = [
  { value: 'data', label: 'Data' },
  { value: 'editada', label: 'Editada' },
  { value: 'status', label: 'Status' },
  { value: 'titulo', label: 'Título' },
]

export function Library() {
  const db = useDB()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<LiteraryStatus>()
  const [genre, setGenre] = useState<string>()
  const [theme, setTheme] = useState<string>()
  const [collectionId, setCollectionId] = useState<string>()
  const [sort, setSort] = useState<LibrarySort>('data')
  const works = useMemo(() => filterWorks(db, { query, status, genre, theme, collectionId }, sort), [db, query, status, genre, theme, collectionId, sort])
  const genres = useMemo(() => genresOf(db), [db])
  const themes = useMemo(() => [...tagCounts(db.literaryWorks, 'themes'), ...tagCounts(db.literaryWorks, 'symbols')].map((t) => t.tag), [db.literaryWorks])
  const archived = db.literaryWorks.filter((w) => w.status === 'arquivado').length
  const filtered = !!(query || status || genre || theme || collectionId)

  return (
    <div>
      <div className="relative">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar título, tema, trecho ou texto"
          aria-label="Buscar no acervo"
          className="input pl-10"
          type="search"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 mt-3" aria-label="Status">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(status === s ? undefined : s)}
            className={`h-9 px-3.5 rounded-full border text-[13px] shrink-0 ${status === s ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink-2'}`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2.5">
        <Select value={genre} onChange={setGenre} placeholder="Gênero" options={genres.map((g) => ({ value: g, label: g }))} />
        <Select value={theme} onChange={setTheme} placeholder="Tema ou símbolo" options={themes.map((t) => ({ value: t, label: t }))} />
        {db.literaryCollections.length > 0 && (
          <Select className="col-span-2" value={collectionId} onChange={setCollectionId} placeholder="Coleção" options={db.literaryCollections.map((c) => ({ value: c.id, label: c.name }))} />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-3">
        <span className="text-[12.5px] text-muted">
          {works.length} {works.length === 1 ? 'obra' : 'obras'}
          {filtered && (
            <button
              type="button"
              className="ml-2 underline underline-offset-4"
              onClick={() => {
                setQuery('')
                setStatus(undefined)
                setGenre(undefined)
                setTheme(undefined)
                setCollectionId(undefined)
              }}
            >
              limpar
            </button>
          )}
        </span>
        <Segmented value={sort} onChange={setSort} options={SORTS} className="max-w-[260px]" />
      </div>

      <div className="space-y-3 mt-3">
        {works.map((w) => {
          const v = latestVersion(db, w.id)
          return <WorkCard key={w.id} work={w} meta={v ? `${v.wordCount} palavras · ${db.literaryVersions.filter((x) => x.workId === w.id).length} versões` : undefined} />
        })}
      </div>
      {works.length === 0 && <EmptyState emoji="🖋️" title="Nada por aqui" text={filtered ? 'Nenhuma obra com esses filtros.' : 'Quando você escrever, as obras aparecem aqui.'} />}
      {!status && archived > 0 && (
        <button type="button" className="mt-4 text-[13px] text-muted h-9" onClick={() => setStatus('arquivado')}>
          Ver arquivadas ({archived})
        </button>
      )}
    </div>
  )
}
