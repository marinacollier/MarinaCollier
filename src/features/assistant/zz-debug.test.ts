import { it } from 'vitest'
import { buildLifeFixture, LIFE_TODAY } from '@/features/search/life-fixture'
import { askMari } from './chief'
import { buildInsights } from './insights'
import { search } from '@/features/search/engine'

it('debug', () => {
  const db = buildLifeFixture()
  const qs = [
    'Quando consigo encaixar yoga?',
    'Quando consigo encaixar musculação?',
    'Amanhã é presencial?',
    'o que levar amanhã?',
    'Tem conflito essa semana?',
    'O que tenho pendente antes da África?',
    'Como está minha semana de treino?',
    'O que estou esperando da Fran?',
    'O que estou esperando do FashionFinder?',
  ]
  for (const q of qs) {
    const a = askMari(db, q, LIFE_TODAY, 8 * 60)
    console.log('\n## ' + q + ' [' + a.agents.map((x) => x.id) + ']\n' + a.headline)
    for (const b of a.blocks) console.log(JSON.stringify(b, (k, v) => (k === 'action' || k === 'refs' ? undefined : v)))
  }
  const mon = askMari(db, 'Amanhã é presencial?', '2026-10-05', 19 * 60)
  console.log('\n## monday', mon.headline, JSON.stringify(mon.blocks.map((b) => b.kind)))
  console.log(buildInsights(db, LIFE_TODAY, 8 * 60, 10).map((i) => i.text))
  console.log(buildInsights(db, '2026-10-05', 19 * 60, 10).map((i) => i.text))
  for (const q of ['safari', 'jnb', 'cerâmica', 'TotalPass', 'Cambly', 'criatividade', 'johannesburg', 'busca', 'quarta natação']) {
    const r = search(db, q, LIFE_TODAY)
    console.log('\n# ' + q, r.groups.map((g) => g.domain + ': ' + g.results.map((x) => x.title + ' | ' + x.subtitle).join(' ;; ')))
  }
})
