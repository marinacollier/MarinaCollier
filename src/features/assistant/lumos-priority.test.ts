/** Lumos · motor de prioridade: "tenho N minutos", "estou cansada", "o que faço agora", "o que posso adiar". */
import { describe, expect, it } from 'vitest'
import type { Now } from '@/data/intel'
import { emptyDB } from '@/data/defaults'
import type { DB, Task } from '@/data/types'
import { respond } from './act/respond'

const AT = '2026-11-01T10:00:00.000Z'
const DATE = '2026-11-14' // Saturday: no work block
const now: Now = {
  date: DATE,
  minutes: 15 * 60,
  iso: '2026-11-14T15:00:00.000-03:00',
}
const task = (id: string, title: string, p: Partial<Task> = {}): Task => ({
  id,
  title,
  status: 'todo',
  order: 0,
  createdAt: AT,
  updatedAt: AT,
  ...p,
})

function db(): DB {
  const d = emptyDB()
  return {
    ...d,
    tasks: [
      task('a', 'Enviar proposta', { dueDate: DATE, durationMin: 30 }),
      task('b', 'Organizar fotos', { durationMin: 60, energyNeed: 4 }),
      task('c', 'Ler artigo', { durationMin: 20 }),
    ],
  }
}

describe('Lumos · o que faz sentido agora', () => {
  it('"o que faço agora?" answers from planDay with reasons', () => {
    const r = respond(db(), 'O que faço agora?', now)!
    expect(r.area).toBe('agora')
    expect(r.text).toContain('Enviar proposta')
    expect(r.lines?.[0].sub).toMatch(/Prazo: vence hoje/)
    expect(r.sections?.map((s) => s.title)).toContain('Espaço livre')
  })

  it('"tenho 30 minutos livres" plans only that much time (20 % kept free)', () => {
    const r = respond(db(), 'tenho 30 minutos livres', now)!
    expect(r.text).toMatch(/^Com 30 min/)
    expect(r.lines?.length).toBe(1)
    expect(r.lines?.[0].sub).toMatch(/~2[05] min/)
  })

  it('"estou cansada" goes light and suggests rest; heavy items wait', () => {
    const r = respond(db(), 'estou cansada', now)!
    expect(r.sub).toMatch(/descansar/)
    const later = r.sections?.find((s) => s.title === 'Podem esperar')
    expect(later?.lines.find((l) => l.text === 'Organizar fotos')?.sub).toBe('Pede mais energia do que tu tem hoje')
  })

  it('"o que posso adiar?" lists only what can wait', () => {
    const r = respond(db(), 'o que posso adiar?', now)!
    expect(r.text).toMatch(/pode esperar/)
    expect(r.lines?.some((l) => l.text === 'Enviar proposta')).toBe(false)
  })

  it('"quero descansar" proposes rest with nothing extra', () => {
    const r = respond(db(), 'quero descansar', now)!
    expect(r.sub).toMatch(/descansar/)
    expect(r.lines?.map((l) => l.text)).toEqual(['Enviar proposta'])
  })

  it('"tenho 1 hora e meia livre hoje, o que faço?" reads 90 min', () => {
    expect(respond(db(), 'tenho 1 hora e meia livre hoje, o que faço?', now)?.text).toMatch(/^Com 1h30/)
  })

  it('other sentences are left to the other handlers', () => {
    expect(respond(db(), 'tenho 1 hora de reunião amanhã', now)?.area).not.toBe('agora')
    expect(respond(db(), 'o que faço com essa porção?', now)?.area).not.toBe('agora')
    expect(respond(db(), 'estou ansiosa', now)?.area).not.toBe('agora')
  })
})
