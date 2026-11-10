import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { actions, applyModuleSeeds, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { apply1106, CAIAQUE_1106 } from '@/data/calendar/fixture-1106'
import { useUI } from '@/app/ui-store'
import TodayPage from './TodayPage'
import TripPage from '@/features/travel/TripPage'
import { setTravelMode } from '@/features/travel/TravelModeLine'
import { materializeWeek } from '@/features/body/planner'

function Where() {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname + loc.search}</div>
}

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/viagens/:id" element={<TripPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

const trip = () => getDB().trips.find((t) => t.expedition)!

beforeAll(() => {
  // jsdom has no scrollIntoView (the trip page scrolls its section chips).
  Element.prototype.scrollIntoView ??= vi.fn()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-06T10:00:00.000Z')) // 07:00 in São Paulo · 12:00 in Cape Town, a Friday
})
afterAll(() => vi.useRealTimers())

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(apply1106(applyModuleSeeds(buildSeed('2026-11-06'))))
  useUI.setState({ sheets: [], toasts: [] })
})
afterEach(cleanup)

describe('Home limpa em viagem (Cape Town, 06/11)', () => {
  it('header is one line with date · place; the old trip blocks are gone from Home', () => {
    renderAt()
    expect(screen.getByRole('banner').textContent).toContain('Sexta, 6 nov · Cape Town')
    for (const label of ['Painel operacional da viagem', 'Painel da viagem', 'Dia da viagem: South Africa 2026', 'Pendências da próxima etapa', 'Gastos e saldo']) expect(screen.queryByLabelText(label)).toBeNull()
    const text = document.body.textContent ?? ''
    for (const gone of ['modo viagem', 'Prioridades', 'próxima ação', 'Ver painel completo', 'Rotina de SP pausada', 'urgente ·', 'Saldo Wise não informado']) expect(text).not.toContain(gone)
    expect(text).not.toMatch(/\d+ de \d+/)
  })

  it('"Faltei nessa aula" right from Home: one absence record, the class stays tagged "faltei", Desfazer clears it', () => {
    renderAt()
    const hoje = () => screen.getByLabelText('Hoje')
    fireEvent.click(within(hoje()).getByText('Aula · Bayswater Cape Town'))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Detalhe do compromisso' })).getByRole('button', { name: /Faltei nessa aula/ }))
    const absences = getDB().tripItems.filter((i) => i.id === `school-absence:${trip().id}:2026-11-06`)
    expect(absences).toHaveLength(1)
    expect(absences[0]).toMatchObject({ title: 'Falta na escola', schoolImpact: 'dia', status: 'feito', date: '2026-11-06' })
    // The class stays on the day, tagged "faltei" (not "feito", not gone).
    const row = [...hoje().querySelectorAll('li')].find((li) => li.textContent?.includes('Aula · Bayswater'))
    expect(row?.textContent).toContain('faltei')
    expect(row?.textContent).not.toContain('feito')
    useUI.getState().toasts.at(-1)!.action!.run()
    expect(getDB().tripItems.some((i) => i.id === `school-absence:${trip().id}:2026-11-06`)).toBe(false)
  })

  it('a conflict on another day is not shown as a conflict of today', () => {
    renderAt()
    const hoje = screen.getByLabelText('Hoje')
    expect(within(hoje).queryByRole('button', { name: /conflito/ })).toBeNull()
  })

  it('Hoje lists the day from the universal calendar: the class at 09:00, in time order, one line each', () => {
    renderAt()
    const hoje = screen.getByLabelText('Hoje')
    // Timed lines only ("Sem horário" lists the day's untimed things below, without a made-up time).
    // Commitment lines (time + quiet category word + title); planned blocks/rituals carry their own aria-label.
    const rows = [...hoje.querySelectorAll('li')].filter((li) => !li.closest('[aria-label="Sem horário"]') && !li.querySelector('button')?.getAttribute('aria-label')).map((li) => li.querySelector('button')?.textContent ?? '')
    expect(rows.some((r) => /^09:00CompromissoAula · Bayswater Cape Town/.test(r))).toBe(true)
    const times = rows.map((r) => r.match(/^(\d\d:\d\d|dia todo)/)?.[1])
    expect(times.every(Boolean)).toBe(true)
    const timed = times.filter((t) => t !== 'dia todo')
    expect(timed).toEqual([...timed].sort())
    // Deadlines and the trip span are not "commitments of the day".
    expect(hoje.textContent).not.toContain('Prazo:')
    expect(hoje.textContent).not.toContain('South Africa 2026')
  })

  it('Próximos dias shows the caiaque on Monday as one line with a tiny chip; its long text lives in the detail', () => {
    renderAt()
    const next = screen.getByLabelText('Próximos dias')
    const monday = within(next).getByRole('group', { name: 'Segunda, 9 nov' })
    const row = [...monday.querySelectorAll('li')].find((li) => li.textContent?.includes('Caiaque'))!
    expect(row.querySelector('button')?.textContent).toBe('13:00Vida pessoal · passeioCaiaque com focas — Hout Bayaguardando')
    expect(document.body.textContent).not.toContain(CAIAQUE_1106.nextAction!)
    expect(document.body.textContent).not.toContain('grupo mínimo')
    fireEvent.click(row.querySelector('button')!)
    const dialog = screen.getByRole('dialog', { name: 'Detalhe do compromisso' })
    expect(dialog.textContent).toContain(CAIAQUE_1106.nextAction!)
  })

  it('Precisa de você: max 3 short rows from the trip ops, P0 payment first with its amount; tap = the booking sheet', () => {
    const lodge = getDB().tripItems.find((i) => i.tripId === trip().id && /safari|kwa maritane/i.test(i.title))!
    actions.update('tripItems', lodge.id, { priority: 'P0', bookingStatus: 'reservado', proof: 'voucher', quotedCents: 400000, paidCents: 0, paymentStatus: 'pendente', currency: 'ZAR', nextAction: 'Pagar o saldo do safári até sexta, senão a reserva cai e perdemos a vaga' })
    renderAt()
    const box = screen.getByLabelText('Precisa de você')
    const rows = [...box.querySelectorAll('li')]
    expect(rows.length).toBeLessThanOrEqual(3)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].textContent).toMatch(/pagar R4\.000$/)
    for (const li of rows) expect((li.textContent ?? '').length).toBeLessThanOrEqual(55)
    expect(box.textContent).not.toContain('senão a reserva cai')
    fireEvent.click(rows[0].querySelector('button')!)
    expect(useUI.getState().sheets.at(-1)).toMatchObject({ name: 'tripItem', props: { id: lodge.id } })
    // "Ver tudo" → the trip's command center, where the full panel lives.
    fireEvent.click(within(box).getByRole('link', { name: /Ver tudo/ }))
    expect(screen.getByLabelText('Painel operacional da viagem')).toBeTruthy()
  })

  it('one chip line for the trip: the next flight and the balance only when she typed it', () => {
    renderAt()
    const chip = screen.getByRole('link', { name: 'Abrir a viagem: South Africa 2026' })
    expect(chip.textContent).toBe('✈︎ SA366 em 7 dias')
    cleanup()
    actions.update('trips', trip().id, { expedition: { ...trip().expedition!, walletBalance: { cents: 1245900, asOf: '2026-11-06', source: 'Wise' } } })
    renderAt()
    expect(screen.getByRole('link', { name: 'Abrir a viagem: South Africa 2026' }).textContent).toBe('✈︎ SA366 em 7 diasSaldo R12.459')
  })

  it('everything that left Home is on the trip page: the full operational panel, with gastos and saldo', () => {
    actions.update('trips', trip().id, { expedition: { ...trip().expedition!, walletBalance: { cents: 1234500, asOf: '2026-11-06', source: 'Wise' } } })
    renderAt(`/viagens/${trip().id}`)
    const panel = screen.getByLabelText('Painel operacional da viagem')
    expect(panel.textContent).toContain('viagem · ')
    expect(panel.textContent).not.toContain('Abrir centro de comando')
    expect(screen.queryByLabelText('Agenda da viagem')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ver painel completo/ }))
    expect(screen.getByLabelText('Agenda da viagem')).toBeTruthy()
    const money = screen.getByLabelText('Gastos e saldo').textContent ?? ''
    for (const k of ['pago', 'comprometido', 'estimado', 'Saldo disponível', '12.345']) expect(money).toContain(k)
  })
})

describe('modo viagem switch', () => {
  it('turns it off (routine back) and on again (generated base removed)', () => {
    setTravelMode(trip(), false)
    expect(getDB().trips.find((t) => t.expedition)!.pauseHomeRoutine).toBe(false)
    const base = materializeWeek(getDB(), '2026-11-02', '2026-11-06')
    expect(base.length).toBeGreaterThan(0)
    actions.createMany('workouts', base)
    const { removed } = setTravelMode(trip(), true)
    expect(removed.length).toBe(base.length)
    expect(getDB().workouts.some((w) => w.date >= '2026-11-06' && w.date <= '2026-11-08' && w.status === 'planejado' && base.some((b) => b.id === w.id))).toBe(false)
    expect(getDB().trips.find((t) => t.expedition)!.pauseHomeRoutine).toBe(true)
  })
})
