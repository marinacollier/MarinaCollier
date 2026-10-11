/** Creator space → the UGC Business door: what needs her now, in one line, and the way in. */
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { useDB } from '@/data/store'
import { ugcDayActions, weekNumbers } from '@/data/ugc/model'
import { useToday } from '@/hooks/useToday'

export function UgcEntry() {
  const today = useToday()
  const db = useDB((d) => d)
  const open = ugcDayActions(db, today, today).filter((a) => !a.done)
  const w = weekNumbers(db, today)
  const brands = db.brands.filter((b) => !b.archived).length
  return (
    <Link to={ROUTES.ugc} className="card p-4 flex items-center gap-3 active:scale-[0.99] transition">
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] font-medium">UGC Business</span>
        <span className="block text-[13px] text-muted mt-0.5">
          {brands ? [open.length ? `${open.length} ${open.length === 1 ? 'coisa precisa' : 'coisas precisam'} de você` : 'nada pendente agora', `${w.newApproaches}/${w.target} abordagens na semana`, `${brands} ${brands === 1 ? 'marca' : 'marcas'}`].join(' · ') : 'marcas, pipeline, follow-ups e metas de prospecção'}
        </span>
      </span>
      <ArrowRight size={16} className="text-muted shrink-0" />
    </Link>
  )
}
