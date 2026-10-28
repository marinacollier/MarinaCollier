/** Laboratório criativo: os exercícios como convites. Sem obrigação diária, sem sequência, sem cobrança. */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { Button, Card, SectionTitle } from '@/components/ui'
import { persist, useDB } from '@/data/store'
import { EXERCISES, exerciseById } from '../exercises'
import { createWork } from '../ops'

export function Lab() {
  const works = useDB((db) => db.literaryWorks)
  const nav = useNavigate()
  const done = useMemo(() => works.filter((w) => w.exerciseId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [works])
  const count = (id: string) => done.filter((w) => w.exerciseId === id).length

  const start = (id: string) => {
    const ex = exerciseById(id)
    if (!ex) return
    const w = createWork({ title: ex.title, origin: 'exercicio', exerciseId: ex.id, status: 'rascunho' })
    void persist()
    nav(ROUTES.atelieWork(w.id) + '?novo=1')
  }

  return (
    <div>
      <p className="text-[13.5px] text-muted leading-snug">Convites para experimentar. Faça quando der vontade — nada aqui vence.</p>
      <div className="space-y-2.5 mt-3">
        {EXERCISES.map((e) => (
          <Card key={e.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-[18px] leading-tight">{e.title}</div>
                <p className="text-[13.5px] text-ink-2 mt-1 leading-snug">{e.prompt}</p>
                {count(e.id) > 0 && <p className="text-[12px] text-muted mt-1">feito {count(e.id)}×</p>}
              </div>
              <Button size="sm" variant="soft" onClick={() => start(e.id)} aria-label={`Começar: ${e.title}`}>
                Começar
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {done.length > 0 && (
        <>
          <SectionTitle>Exercícios feitos</SectionTitle>
          <div className="card overflow-hidden divide-y divide-line/70">
            {done.map((w) => (
              <button key={w.id} type="button" className="w-full text-left px-4 py-3 active:bg-surface-2" onClick={() => nav(ROUTES.atelieWork(w.id) + '?aba=ficha')}>
                <div className="font-display text-[17px]">{w.title}</div>
                <div className="text-[12.5px] text-muted mt-0.5">{w.learned ? `Aprendi: ${w.learned}` : 'Anote o que aprendeu na ficha da obra'}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
