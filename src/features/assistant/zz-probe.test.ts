import { it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { getDB, useStore } from '@/data/store'
import { understand } from './router'
const T = '2026-10-05'
it('probe', () => {
  useStore.setState({ db: buildSeed(T), hydrated: true })
  for (const s of ['acordei agora, tô 30 min atrasada','amanhã fiquei presencial','domingo o pedal passou pra 4h','comi um brownie agora','terminei o livro','Fran me respondeu','faz minha feira','já tenho arroz, whey e café','monta minha semana','o que mudou desde ontem?','o que realmente precisa de mim?','tô na página 190','coloca Inspired na minha lista','esse livro tá chato, tira da fila','o que eu leio depois?','preciso lembrar de comprar ração da Luna','ideia de reels correndo na África','me atualiza de trabalho','o que falta pra África?','o que eu tenho hoje?','bom dia','organiza meu dia','não faço mais yoga na terça','tira yoga de terça do padrão','fiz seis porções de frango grelhado','me mostra algo que eu salvei pra estudar','o que você sabe sobre mim?','lembra que eu prefiro nadar cedo']) {
    const t = understand(getDB(), s, T, 5*60+30)
    let extra = ''
    if (t.kind === 'reply') {
      const r = t.reply
      extra = `${r.text} | ${r.sub ?? ''} | lines=${(r.lines??[]).map(l=>l.text).slice(0,4).join(' / ')} | sections=${(r.sections??[]).map(x=>x.title+':'+x.lines.length).join(',')} | opts=${(r.options??[]).map(o=>o.label).join(',')} | ${r.action?.mode ?? ''}`
      if (r.action?.mode === 'direct') r.action.run()
    }
    if (t.kind === 'adjust') extra = (t.plan.needsChoice?.question ?? t.plan.previewTitle ?? t.plan.summary)
    console.log('>> ' + s + '\n   ' + t.kind + ' ' + extra.slice(0, 600))
  }
  console.log(getDB().lifeLog.map(e=>e.title).join('\n'))
})
