import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { useDB } from '@/data/store'
import { Chip, IconButton, Page, PageHeader, Segmented } from '@/components/ui'
import { pluralize } from '@/lib/text'
import ContentTab from './ContentTab'
import IdeasTab from './IdeasTab'
import PartnershipsTab from './PartnershipsTab'
import { activePartnerships, creatorProjects } from './selectors'

type Tab = 'parcerias' | 'conteudo' | 'ideias'
const TABS: { value: Tab; label: string }[] = [
  { value: 'parcerias', label: 'Parcerias' },
  { value: 'conteudo', label: 'Conteúdo' },
  { value: 'ideias', label: 'Ideias' },
]

export default function CreatorPage() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : 'parcerias'
  const projects = useDB((db) => db.projects)
  const series = useMemo(() => creatorProjects(projects), [projects])
  const rawSerie = params.get('serie') ?? undefined
  const serie = series.some((p) => p.id === rawSerie) ? rawSerie : undefined
  const current = series.find((p) => p.id === serie)

  const go = (t: Tab, s: string | undefined = serie) => {
    const next: Record<string, string> = {}
    if (t !== 'parcerias') next.tab = t
    if (s) next.serie = s
    setParams(next, { replace: true })
  }

  const partnerships = useDB((db) => db.partnerships)
  const items = useDB((db) => db.contentItems)
  const subtitle = useMemo(() => {
    const active = activePartnerships(partnerships).length
    const inProgress = items.filter((c) => c.stage !== 'ideia' && c.stage !== 'publicado').length
    const ideas = items.filter((c) => c.stage === 'ideia').length
    const parts: string[] = []
    if (active) parts.push(pluralize(active, 'parceria ativa', 'parcerias ativas'))
    if (inProgress) parts.push(`${inProgress} em produção`)
    if (ideas) parts.push(pluralize(ideas, 'ideia', 'ideias'))
    return parts.length ? parts.join(' · ') : 'conteúdo, parcerias e ideias num lugar só'
  }, [partnerships, items])

  const add = () => {
    if (tab === 'parcerias') openSheet('partnership', {})
    else openSheet('content', { defaults: serie ? { projectId: serie } : undefined })
  }

  const showSeries = tab !== 'parcerias' && series.length > 1

  return (
    <Page>
      <PageHeader
        back
        backTo={ROUTES.work}
        eyebrow="Trabalho · creator"
        title="Conteúdo & UGC"
        subtitle={subtitle}
        actions={
          tab !== 'ideias' && (
            <IconButton label={tab === 'parcerias' ? 'Nova parceria' : 'Novo conteúdo'} onClick={add}>
              <Plus size={22} />
            </IconButton>
          )
        }
      />
      <Segmented value={tab} onChange={(t) => go(t)} options={TABS} className="mb-4" />

      {showSeries && (
        <div className="mb-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" role="group" aria-label="Filtrar por projeto ou série">
            <Chip selected={!serie} onClick={() => go(tab, undefined)}>
              Tudo
            </Chip>
            {series.map((p) => (
              <Chip key={p.id} selected={serie === p.id} onClick={() => go(tab, serie === p.id ? undefined : p.id)}>
                <span aria-hidden>{p.emoji}</span>
                <span className="max-w-[210px] truncate">{p.name}</span>
              </Chip>
            ))}
          </div>
          {current && (
            <button
              type="button"
              onClick={() => nav(ROUTES.project(current.id))}
              className="mt-2.5 w-full card px-4 py-3 flex items-center gap-3 text-left active:scale-[0.99] transition"
            >
              <span className="text-[20px]" aria-hidden>
                {current.emoji}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14.5px] font-medium leading-snug">{current.name}</span>
                {current.description && <span className="block text-[12.5px] text-muted leading-snug mt-0.5">{current.description}</span>}
              </span>
              <ArrowRight size={16} className="text-muted shrink-0" />
            </button>
          )}
        </div>
      )}

      {tab === 'parcerias' && <PartnershipsTab />}
      {tab === 'conteudo' && <ContentTab projectId={serie} />}
      {tab === 'ideias' && <IdeasTab projectId={serie} />}
    </Page>
  )
}
