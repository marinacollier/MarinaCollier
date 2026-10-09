/** Privacy code, end to end on the real screens: create, lock, wrong code, unlock, change, restart, background relock. */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { areaLocked, lockSession, useLockState } from '@/app/lock-store'
import { actions, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { verifyPin } from '@/lib/lock'
import { LockGate } from '@/components/layout/LockGate'
import { PrivacyLockSection } from './PrivacyLockSection'

let device: ReturnType<typeof createMemoryAdapter>
beforeEach(async () => {
  device = createMemoryAdapter()
  await hydrate(device)
  actions.replaceDB(buildSeed('2026-10-09'))
  lockSession()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

async function unlockWith(code: string) {
  type('Código', code)
  fireEvent.click(screen.getByText('Desbloquear'))
}

describe('privacy code — real flow', () => {
  it('create → (restart) locked → wrong code → unlock → change → old code fails, new works', async () => {
    // Create.
    render(<PrivacyLockSection />)
    fireEvent.click(screen.getByText('Ligar trava'))
    type('novo código (4 a 8 números)', '2580')
    type('repita o código', '2581')
    fireEvent.click(screen.getByText('Ligar com este código'))
    await waitFor(() => expect(screen.getByText('Os dois códigos não batem.')).toBeTruthy())
    type('repita o código', '2580')
    fireEvent.click(screen.getByText('Ligar com este código'))
    await waitFor(() => expect(getDB().profile.privacyLock?.enabled).toBe(true))
    expect(JSON.stringify(getDB())).not.toContain('"2580"')
    cleanup()

    // Restart: the app closes (pagehide flush) and opens again — session state starts locked.
    await flushNow()
    useLockState.setState({ unlockedAt: undefined, hiddenAt: undefined })
    await hydrate(device)
    expect(getDB().profile.privacyLock?.enabled).toBe(true)
    expect(areaLocked(getDB().profile.privacyLock, 'dinheiro')).toBe(true)

    render(
      <LockGate area="dinheiro">
        <p>valores</p>
      </LockGate>,
    )
    expect(screen.queryByText('valores')).toBeNull()
    await unlockWith('1111')
    await waitFor(() => expect(screen.getByText('Código não confere.')).toBeTruthy())
    expect(screen.queryByText('valores')).toBeNull()
    await unlockWith('2580')
    await waitFor(() => expect(screen.getByText('valores')).toBeTruthy())
    cleanup()

    // Change: wrong current code is refused and nothing changes; then the new one replaces the old.
    const before = getDB().profile.privacyLock!.pinHash
    render(<PrivacyLockSection />)
    fireEvent.click(screen.getByText('Trocar código'))
    type('código atual', '0000')
    type('novo código', '1357')
    fireEvent.click(screen.getByText('Trocar'))
    await waitFor(() => expect(screen.getByText('O código atual não confere.')).toBeTruthy())
    expect(getDB().profile.privacyLock!.pinHash).toBe(before)
    type('código atual', '2580')
    fireEvent.click(screen.getByText('Trocar'))
    await waitFor(() => expect(getDB().profile.privacyLock!.pinHash).not.toBe(before))
    expect(await verifyPin('2580', getDB().profile.privacyLock!)).toBe(false)
    expect(await verifyPin('1357', getDB().profile.privacyLock!)).toBe(true)

    // And it survives a restart.
    await flushNow()
    await hydrate(device)
    expect(await verifyPin('1357', getDB().profile.privacyLock!)).toBe(true)
  })

  it('locks again after the app stays in the background longer than the chosen minutes', async () => {
    actions.setProfile({ privacyLock: { enabled: true, areas: ['carreira'], pinHash: 'h', pinSalt: 's', relockMinutes: 1 } })
    useLockState.setState({ unlockedAt: Date.now() })
    vi.useFakeTimers({ toFake: ['Date'] })
    const hidden = (v: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
      document.dispatchEvent(new Event('visibilitychange'))
    }
    // Short trip out: stays open.
    hidden('hidden')
    vi.setSystemTime(Date.now() + 20_000)
    hidden('visible')
    await act(async () => void (await import('@/data/store')))
    await waitFor(() => expect(useLockState.getState().hiddenAt).toBeUndefined())
    expect(areaLocked(getDB().profile.privacyLock, 'carreira')).toBe(false)
    // Long trip out: locked again.
    hidden('hidden')
    vi.setSystemTime(Date.now() + 2 * 60_000)
    hidden('visible')
    await waitFor(() => expect(areaLocked(getDB().profile.privacyLock, 'carreira')).toBe(true))
  })

  it('turning it off needs the code', async () => {
    render(<PrivacyLockSection />)
    fireEvent.click(screen.getByText('Ligar trava'))
    type('novo código (4 a 8 números)', '2580')
    type('repita o código', '2580')
    fireEvent.click(screen.getByText('Ligar com este código'))
    await waitFor(() => expect(screen.getByText('Desligar trava')).toBeTruthy())
    fireEvent.click(screen.getByText('Desligar trava'))
    type('código atual', '9999')
    fireEvent.click(screen.getByText('Desligar'))
    await waitFor(() => expect(screen.getByText('O código não confere.')).toBeTruthy())
    expect(getDB().profile.privacyLock?.enabled).toBe(true)
    type('código atual', '2580')
    fireEvent.click(screen.getByText('Desligar'))
    await waitFor(() => expect(getDB().profile.privacyLock).toBeUndefined())
  })
})
