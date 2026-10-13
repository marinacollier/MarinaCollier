import { describe, expect, it } from 'vitest'
import type { Exchange } from './conversation'
import type { LumosReply } from './act/types'
import { collapsible, latestGroup, toastText } from './sheet'

const run = () => () => {}
const ex = (id: number, reply: LumosReply, status: 'done' | 'pending' | 'saving' = 'done', partOf?: number): Exchange => ({ id, question: 'q', partOf, lumos: { reply, status } })
const direct = (text: string, extra: Partial<LumosReply> = {}): LumosReply => ({ area: 'feito', text, action: { mode: 'direct', run }, ...extra })
const yes = () => true

describe('Lumos sheet · when it folds into a toast', () => {
  it('a simple direct action, saved, folds', () => {
    const g = latestGroup([ex(1, direct('Anotei.')), ex(2, direct('Criei “ligar pro banco” pra hoje ✓'))])
    expect(g.map((e) => e.id)).toEqual([2])
    expect(collapsible(g, yes)).toBe(true)
    expect(toastText(g)).toBe('Criei “ligar pro banco” pra hoje ✓')
  })

  it('a two-action sentence is one group', () => {
    const g = latestGroup([ex(1, direct('A')), ex(2, direct('B'), 'done', 1)])
    expect(g).toHaveLength(2)
    expect(collapsible(g, yes)).toBe(true)
    expect(toastText(g)).toBe('Feito: 2 coisas ✓')
  })

  it('stays open: confirm, still saving, no undo, options, sections (email draft), long lists, answers', () => {
    expect(collapsible([ex(1, { area: 'x', text: 't', action: { mode: 'confirm', run } }, 'pending')], yes)).toBe(false)
    expect(collapsible([ex(1, direct('t'), 'saving')], yes)).toBe(false)
    expect(collapsible([ex(1, direct('t'))], () => false)).toBe(false)
    expect(collapsible([ex(1, direct('t', { options: [{ label: 'Sim', ask: 'sim' }] }))], yes)).toBe(false)
    expect(collapsible([ex(1, direct('Rascunho', { sections: [{ title: 'Mensagem', lines: [{ text: 'Oi' }] }] }))], yes)).toBe(false)
    expect(collapsible([ex(1, direct('t', { lines: [1, 2, 3, 4].map((i) => ({ text: `${i}` })) }))], yes)).toBe(false)
    expect(collapsible([ex(1, { area: 'ugc', text: 'Top marcas', lines: [{ text: 'Breevo' }] })], yes)).toBe(false)
    expect(collapsible([], yes)).toBe(false)
  })
})
