import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useDB } from '@/data/store'
import type { BodyComposition } from '@/data/types'
import { openSheet } from '@/app/ui-store'
import { ROUTES } from '@/app/routes'
import { Button, EmptyState, IconButton, ListCard, ListRow, Page, PageHeader, Pill, SectionTitle } from '@/components/ui'
import { formatFullDate } from '@/lib/date'

const num = (n: number) => String(n).replace('.', ',')

/** Newest first; undated history at the end. */
export function sortComposition(list: BodyComposition[]): BodyComposition[] {
  return [...list].sort((a, b) => {
    if (!!a.historical !== !!b.historical) return a.historical ? 1 : -1
    return (b.date ?? '').localeCompare(a.date ?? '')
  })
}

export default function EvolutionPage() {
  const list = useDB((db) => db.bodyComposition)
  const nav = useNavigate()
  const entries = useMemo(() => sortComposition(list), [list])

  return (
    <Page>
      <PageHeader
        eyebrow="corpo"
        title="Evolução"
        subtitle="Foco diário: treinar, comer, recuperar e viver."
        back
        actions={
          <IconButton label="Novo registro" onClick={() => openSheet('bodyComposition', {})}>
            <Plus size={22} />
          </IconButton>
        }
      />

      <SectionTitle>composição corporal</SectionTitle>
      {entries.length === 0 ? (
        <EmptyState
          emoji="🌿"
          title="Nenhum registro por aqui"
          text="Quando fizer uma avaliação, guarde aqui. Sem pressa."
          action={
            <Button size="sm" variant="soft" onClick={() => openSheet('bodyComposition', {})}>
              Adicionar registro
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {entries.map((e, i) => (
            <motion.button
              key={e.id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => openSheet('bodyComposition', { id: e.id })}
              className={`card w-full text-left p-4 active:scale-[0.99] transition ${e.historical ? 'opacity-80' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-[19px] leading-tight">{e.label ?? 'Registro'}</div>
                  <div className="text-[13px] text-muted mt-0.5">{e.date ? formatFullDate(e.date) : e.historical ? 'referência antiga' : 'sem data'}</div>
                </div>
                {e.historical && <Pill>histórico, não é meta</Pill>}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
                <Metric label="Peso" value={e.weightKg != null ? `${num(e.weightKg)} kg` : undefined} />
                <Metric label="Gordura" value={e.bodyFatPct != null ? `${num(e.bodyFatPct)}%` : undefined} />
                <Metric label="Massa de gordura" value={e.fatMassKg != null ? `${num(e.fatMassKg)} kg` : undefined} />
                <Metric label="Massa muscular esquelética" value={e.skeletalMuscleKg != null ? `${num(e.skeletalMuscleKg)} kg` : undefined} />
              </dl>
              {e.notes && <p className="text-[12.5px] text-muted mt-3 italic">{e.notes}</p>}
            </motion.button>
          ))}
        </div>
      )}

      <p className="text-[13px] text-muted mt-5 px-1 leading-relaxed">
        Esses números são referência, não placar. O que importa no dia a dia é treinar bem, comer pra performar e recuperar.
      </p>

      <SectionTitle>alimentação</SectionTitle>
      <ListCard>
        <ListRow leading={<span className="text-xl">🍽️</span>} title="Estratégia nutricional" subtitle="plano do nutri e estratégias por treino" chevron onPress={() => nav(ROUTES.nutrition)} />
      </ListCard>
    </Page>
  )
}

function Metric({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-muted leading-tight">{label}</dt>
      <dd className="text-[15px] tabular-nums mt-0.5">{value ?? '—'}</dd>
    </div>
  )
}
