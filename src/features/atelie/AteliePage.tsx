/**
 * Ateliê Literário — module home. Private (never synced; can be locked in Ajustes → Privacidade).
 * Tabs: Visão geral · Biblioteca · Coleções · Evolução · Mapa · Laboratório (kept in ?v= so "voltar" returns to it).
 */
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { PenLine } from 'lucide-react'
import { IconButton, Page, PageHeader, Segmented } from '@/components/ui'
import { LockGate } from '@/components/layout/LockGate'
import { ATELIE_SUBTITLE, ATELIE_TITLE } from './model'
import { SERIF } from './parts'
import { Collections } from './views/Collections'
import { Evolution } from './views/Evolution'
import { Lab } from './views/Lab'
import { Library } from './views/Library'
import { Overview } from './views/Overview'
import { WritingMap } from './views/WritingMap'

export type AtelieTab = 'geral' | 'biblioteca' | 'colecoes' | 'evolucao' | 'mapa' | 'laboratorio'

const TABS: { value: AtelieTab; label: string }[] = [
  { value: 'geral', label: 'Visão geral' },
  { value: 'biblioteca', label: 'Biblioteca' },
  { value: 'colecoes', label: 'Coleções' },
  { value: 'evolucao', label: 'Evolução' },
  { value: 'mapa', label: 'Mapa' },
  { value: 'laboratorio', label: 'Laboratório' },
]

export default function AteliePage() {
  return (
    <LockGate area="atelie">
      <Atelie />
    </LockGate>
  )
}

function Atelie() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.value === params.get('v')) ? params.get('v') : 'geral') as AtelieTab
  const [writing, setWriting] = useState(false)
  const setTab = (v: AtelieTab) => setParams(v === 'geral' ? {} : { v }, { replace: true })

  return (
    <Page>
      <PageHeader
        title={ATELIE_TITLE}
        eyebrow="Aprender"
        subtitle={
          <span className="italic" style={SERIF}>
            {ATELIE_SUBTITLE}
          </span>
        }
        back
        backTo={ROUTES.spaces}
        search={false}
        actions={
          <IconButton
            label="Escrever"
            onClick={() => {
              setTab('geral')
              setWriting(true)
            }}
          >
            <PenLine size={20} />
          </IconButton>
        }
      />
      <Segmented variant="tabs" value={tab} onChange={setTab} options={TABS} className="-mx-4 px-4" />
      <div className="mt-4">
        {tab === 'geral' && <Overview writing={writing} setWriting={setWriting} />}
        {tab === 'biblioteca' && <Library />}
        {tab === 'colecoes' && <Collections />}
        {tab === 'evolucao' && <Evolution />}
        {tab === 'mapa' && <WritingMap />}
        {tab === 'laboratorio' && <Lab />}
      </div>
      <p className="text-[12px] text-muted text-center mt-10">Privado: fica só neste aparelho e no seu backup. Nunca é publicado nem compartilhado.</p>
    </Page>
  )
}
