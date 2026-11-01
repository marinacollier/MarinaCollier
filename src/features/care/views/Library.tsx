/** Biblioteca de técnicas, com filtro de favoritas e por abordagem. */
import { useState } from 'react'
import { Chip, EmptyState } from '@/components/ui'
import { useDB } from '@/data/store'
import { favoriteIds } from '../ops'
import { TechniqueCard } from '../parts'
import { TECHNIQUES, type CareApproach } from '../techniques'

const APPROACHES: CareApproach[] = ['DBT', 'TCC', 'ACT', 'mindfulness', 'ativação comportamental']

export function Library() {
  const [onlyFav, setOnlyFav] = useState(false)
  const [approach, setApproach] = useState<CareApproach | undefined>()
  const favs = useDB((db) => favoriteIds(db).join('|'))
  const favSet = new Set(favs ? favs.split('|') : [])
  const list = TECHNIQUES.filter((t) => (!onlyFav || favSet.has(t.id)) && (!approach || t.approach === approach))

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
        <Chip selected={onlyFav} onClick={() => setOnlyFav((v) => !v)}>
          ★ Favoritas{favSet.size ? ` · ${favSet.size}` : ''}
        </Chip>
        {APPROACHES.map((a) => (
          <Chip key={a} selected={approach === a} onClick={() => setApproach(approach === a ? undefined : a)}>
            {a}
          </Chip>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState emoji="☆" title={onlyFav ? 'Nenhuma favorita ainda' : 'Nada aqui'} text={onlyFav ? 'Toque na estrela das técnicas que fizerem sentido para você.' : undefined} compact />
      ) : (
        list.map((t) => <TechniqueCard key={t.id} t={t} />)
      )}
      <p className="text-[12px] text-muted text-center">Conteúdo de referência baseado nas fontes citadas em cada técnica. Não substitui acompanhamento profissional.</p>
    </div>
  )
}
