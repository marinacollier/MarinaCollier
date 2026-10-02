import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { useDB } from '@/data/store'
import { IconButton, Page, PageHeader, Segmented } from '@/components/ui'
import { pluralize } from '@/lib/text'
import ContentTab from './ContentTab'
import IdeasTab from './IdeasTab'
import PartnershipsTab from './PartnershipsTab'
import { activePartnerships } from './selectors'

type Tab = 'parcerias' | 'conteudo' | 'ideias'
const TABS: { value: Tab; label: string }[] = [
  { value: 'parcerias', label: 'Parcerias' },
  { value: 'conteudo', label: 'Conteúdo' },
  { value: 'ideias', label: 'Ideias' },
]

export default function CreatorPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : 'parcerias'
  const setTab = (t: Tab) => setParams(t === 'parcerias' ? {} : { tab: t }, { replace: true })

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
    else openSheet('content', {})
  }

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
      <Segmented value={tab} onChange={setTab} options={TABS} className="mb-4" />
      {tab === 'parcerias' && <PartnershipsTab />}
      {tab === 'conteudo' && <ContentTab />}
      {tab === 'ideias' && <IdeasTab />}
    </Page>
  )
}
