import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { areaLocked, lockSession, unlockSession } from '@/app/lock-store'
import { actions, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { biometricAvailable, hashPin, validPin, verifyPin } from '@/lib/lock'
import { LockGate } from './LockGate'

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed('2026-10-09'))
  lockSession()
})
afterEach(cleanup)

describe('privacy lock', () => {
  it('code is stored only as a salted PBKDF2 hash and verifies', async () => {
    const lock = await hashPin('2580')
    expect(lock.hash).not.toContain('2580')
    expect(await verifyPin('2580', { pinHash: lock.hash, pinSalt: lock.salt })).toBe(true)
    expect(await verifyPin('0000', { pinHash: lock.hash, pinSalt: lock.salt })).toBe(false)
    expect((await hashPin('2580')).hash).not.toBe(lock.hash) // new salt each time
    expect(validPin('12')).toBe(false)
    expect(validPin('123456')).toBe(true)
  })

  it('only the chosen areas lock, and only while the session is locked', async () => {
    const { hash, salt } = await hashPin('2580')
    const lock = { enabled: true, areas: ['dinheiro' as const], pinHash: hash, pinSalt: salt, relockMinutes: 5 }
    expect(areaLocked(lock, 'dinheiro')).toBe(true)
    expect(areaLocked(lock, 'carreira')).toBe(false)
    unlockSession()
    expect(areaLocked(lock, 'dinheiro')).toBe(false)
    expect(areaLocked(undefined, 'dinheiro')).toBe(false)
  })

  it('no fake biometrics: without a platform authenticator, Face ID is simply unavailable', async () => {
    expect(await biometricAvailable()).toBe(false)
  })

  it('the gate hides the content until the right code is typed', async () => {
    const { hash, salt } = await hashPin('2580')
    actions.setProfile({ privacyLock: { enabled: true, areas: ['dinheiro'], pinHash: hash, pinSalt: salt, relockMinutes: 5 } })
    render(
      <LockGate area="dinheiro">
        <p>segredo</p>
      </LockGate>,
    )
    expect(screen.queryByText('segredo')).toBeNull()
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '1111' } })
    fireEvent.click(screen.getByText('Desbloquear'))
    await waitFor(() => expect(screen.getByText('Código não confere.')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: '2580' } })
    fireEvent.click(screen.getByText('Desbloquear'))
    await waitFor(() => expect(screen.getByText('segredo')).toBeTruthy())
  })
})
