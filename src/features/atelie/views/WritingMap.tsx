/** Mapa da escrita: temas e símbolos → obras. Em ≥3 obras = "muito presente". Só o que ela marcou. */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { Card, Pill, SectionTitle, Segmented } from '@/components/ui'
import { useDB } from '@/data/store'
import { cn } from '@/lib/cn'
import { VERY_PRESENT, writingMap, type MapNode } from '../model'

export function WritingMap() {
  const db = useDB()
  const [kind, setKind] = useState<'todos' | 'símbolo' | 'tema'>('todos')
  const nodes = useMemo(() => writingMap(db).filter((n) => kind === 'todos' || n.kind === kind), [db, kind])
  const strong = nodes.filter((n) => n.veryPresent)
  const shared = nodes.filter((n) => !n.veryPresent && n.works.length > 1)
  const single = nodes.filter((n) => n.works.length === 1)

  return (
    <div>
      <p className="text-[13.5px] text-muted leading-snug">Os temas e as imagens que você marcou, e as obras em que aparecem. Em {VERY_PRESENT} ou mais obras, aparecem como “muito presente”.</p>
      <Segmented
        className="mt-3"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'todos', label: 'Tudo' },
          { value: 'símbolo', label: 'Símbolos' },
          { value: 'tema', label: 'Temas' },
        ]}
      />
      {strong.length > 0 && (
        <>
          <SectionTitle>Muito presentes</SectionTitle>
          <div className="space-y-2">
            {strong.map((n) => (
              <NodeCard key={n.kind + n.tag} n={n} />
            ))}
          </div>
        </>
      )}
      {shared.length > 0 && (
        <>
          <SectionTitle>Ligam obras</SectionTitle>
          <div className="space-y-2">
            {shared.map((n) => (
              <NodeCard key={n.kind + n.tag} n={n} />
            ))}
          </div>
        </>
      )}
      {single.length > 0 && (
        <>
          <SectionTitle>Em uma obra só</SectionTitle>
          <Card>
            <div className="flex flex-wrap gap-1.5">
              {single.map((n) => (
                <span key={n.kind + n.tag} className={cn('h-7 px-2.5 rounded-full text-[12.5px] inline-flex items-center', n.kind === 'símbolo' ? 'bg-plum-soft text-plum' : 'border border-line text-ink-2')} title={n.works[0]?.title}>
                  {n.tag}
                </span>
              ))}
            </div>
          </Card>
        </>
      )}
      {nodes.length === 0 && <p className="text-[14px] text-muted mt-4">Marque temas e símbolos nas obras para o mapa aparecer.</p>}
      <p className="text-[12.5px] text-muted mt-5">Conexões sugeridas por IA (sempre revisáveis por você): em breve.</p>
    </div>
  )
}

function NodeCard({ n }: { n: MapNode }) {
  const nav = useNavigate()
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-display text-[19px]">{n.tag}</span>
          <span className="text-[12px] text-muted ml-2">{n.kind}</span>
        </div>
        {n.veryPresent ? <Pill className="bg-sand-soft text-sand">muito presente</Pill> : <span className="text-[12px] text-muted">{n.works.length} obras</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {n.works.map((w) => (
          <button key={w.id} type="button" onClick={() => nav(ROUTES.atelieWork(w.id))} className="h-8 px-3 rounded-full bg-surface-2 text-[13px] font-display">
            {w.title}
          </button>
        ))}
      </div>
    </Card>
  )
}
