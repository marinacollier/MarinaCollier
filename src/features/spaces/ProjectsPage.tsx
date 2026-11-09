/**
 * PROJETOS (MARINA OS 2.0) — her professional and personal projects in one list: each project, Carreira, UGC e
 * parcerias and what she is waiting for. One tap opens the project; the full work view stays one step away.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { IconButton, Page, PageHeader } from '@/components/ui'
import { useDB } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { projectEntries } from './entries'
import { HubSection } from './hub'

export default function ProjectsPage() {
  const db = useDB()
  const today = useToday()
  const nav = useNavigate()
  const entries = useMemo(() => projectEntries(db, today), [db, today])
  const projects = entries.filter((e) => e.key.startsWith('project:'))
  const around = entries.filter((e) => !e.key.startsWith('project:'))

  return (
    <Page>
      <PageHeader
        title="Projetos"
        search={false}
        actions={
          <IconButton label="Registrar algo" onClick={() => openSheet('quickAdd')}>
            <Plus size={21} />
          </IconButton>
        }
      />
      {projects.length > 0 && <HubSection label="Projetos" entries={projects} all="visão de trabalho" onAll={() => nav(ROUTES.work)} />}
      <button type="button" onClick={() => nav(ROUTES.myWeek)} className="mt-2 px-1 text-[13.5px] text-muted underline underline-offset-2">
        Minha semana · horas por projeto
      </button>
      {around.length > 0 && <HubSection label="Carreira, parcerias e retornos" entries={around} delay={40} />}
      {!entries.length && <p className="mt-10 px-1 text-[15px] text-muted">Nenhum projeto aberto. Um projeto novo começa pelo + .</p>}
    </Page>
  )
}
