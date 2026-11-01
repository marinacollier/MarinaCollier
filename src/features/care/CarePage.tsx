/**
 * Cuidar de Mim — kit de autocuidado emocional (Etapa 1). Determinístico, sem IA.
 * Abas em ?v= (acalmar · técnicas · pausa · decidir · apoio). Entrada discreta em Espaços, nunca na Home.
 * Sem LockGate de propósito: a ajuda humana (CVV 188 etc.) precisa abrir sem nenhuma barreira.
 * Ver docs/cuidar-de-mim-auditoria.md (o diário íntimo ainda não existe).
 */
import { useSearchParams } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { IconButton, Page, PageHeader, Segmented } from '@/components/ui'
import { Calm } from './views/Calm'
import { Decide } from './views/Decide'
import { Library } from './views/Library'
import { Pause } from './views/Pause'
import { Support } from './views/Support'

export type CareTab = 'acalmar' | 'tecnicas' | 'pausa' | 'decidir' | 'apoio'

const TABS: { value: CareTab; label: string }[] = [
  { value: 'acalmar', label: 'Acalmar' },
  { value: 'tecnicas', label: 'Técnicas' },
  { value: 'pausa', label: 'Modo Pausa' },
  { value: 'decidir', label: 'Antes de decidir' },
  { value: 'apoio', label: 'Apoio' },
]

export default function CarePage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.value === params.get('v')) ? params.get('v') : 'acalmar') as CareTab
  const setTab = (v: CareTab) => setParams(v === 'acalmar' ? {} : { v }, { replace: true })

  return (
    <Page>
      <PageHeader
        title="Cuidar de Mim"
        eyebrow="Vida"
        subtitle="Técnicas para atravessar momentos difíceis, no seu ritmo."
        back
        backTo={ROUTES.spaces}
        search={false}
        actions={
          <IconButton label="Ajuda humana agora" onClick={() => setTab('apoio')}>
            <Phone size={20} />
          </IconButton>
        }
      />
      <Segmented variant="tabs" value={tab} onChange={setTab} options={TABS} className="-mx-4 px-4" />
      <div className="mt-5">
        {tab === 'acalmar' && <Calm />}
        {tab === 'tecnicas' && <Library />}
        {tab === 'pausa' && <Pause params={params} />}
        {tab === 'decidir' && <Decide />}
        {tab === 'apoio' && <Support />}
      </div>
      <p className="text-[12px] text-muted text-center mt-10">
        Isto é um apoio, não um tratamento. Se estiver em perigo, ligue 188 (CVV) ou 192 (SAMU) no Brasil, ou 112 / 10111 na África do Sul.
      </p>
    </Page>
  )
}
