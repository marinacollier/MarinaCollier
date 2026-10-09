/** Guards a sensitive area (Dinheiro, Carreira). Face ID first when this device has it; the code always works. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Lock, ScanFace } from 'lucide-react'
import { areaLocked, unlockSession, useLockState } from '@/app/lock-store'
import { useDB } from '@/data/store'
import type { LockArea } from '@/data/types'
import { biometricAvailable, verifyBiometric, verifyPin } from '@/lib/lock'
import { haptic } from '@/lib/haptics'

const AREA_LABEL: Record<LockArea, string> = { dinheiro: 'Dinheiro', carreira: 'Carreira' }

export function LockGate({ area, children, compact }: { area: LockArea; children: ReactNode; compact?: boolean }) {
  const lock = useDB((db) => db.profile.privacyLock)
  const session = useLockState()
  const locked = areaLocked(lock, area, session)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string>()
  const [bio, setBio] = useState(false)
  const asked = useRef(false)

  useEffect(() => {
    if (!locked || !lock?.credentialId) return
    void biometricAvailable().then((ok) => {
      setBio(ok)
      if (ok && !asked.current) {
        asked.current = true
        void tryBio()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, lock?.credentialId])

  if (!locked || !lock) return <>{children}</>

  async function tryBio() {
    if (!lock?.credentialId) return
    if (await verifyBiometric(lock.credentialId)) {
      haptic('success')
      unlockSession()
    }
  }

  async function submit(value: string) {
    if (!lock) return
    if (await verifyPin(value, lock)) {
      haptic('success')
      unlockSession()
    } else {
      haptic('light')
      setError('Código não confere.')
      setPin('')
    }
  }

  return (
    <div className={compact ? 'py-6 px-5 text-center' : 'min-h-[70dvh] flex flex-col items-center justify-center px-8 text-center'}>
      <span className="h-12 w-12 rounded-full bg-surface-2 inline-flex items-center justify-center text-ink-2">
        <Lock size={20} />
      </span>
      <h1 className="font-display text-[24px] mt-4">{AREA_LABEL[area]} está protegido</h1>
      <p className="text-[14px] text-muted mt-1">Desbloqueia pra ver.</p>
      {bio && lock.credentialId && (
        <button type="button" onClick={() => void tryBio()} className="mt-5 h-12 px-5 rounded-full bg-ink text-bg inline-flex items-center gap-2 text-[15px]">
          <ScanFace size={18} /> Usar Face ID
        </button>
      )}
      <form
        className="mt-5 w-full max-w-[220px]"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(pin)
        }}
      >
        <input
          value={pin}
          onChange={(e) => {
            setError(undefined)
            setPin(e.target.value.replace(/\D/g, '').slice(0, 8))
          }}
          inputMode="numeric"
          autoComplete="off"
          type="password"
          aria-label="Código"
          placeholder="código"
          className="input text-center tracking-[0.4em] text-[18px]"
        />
        {error && <p className="text-[13px] text-sand mt-2">{error}</p>}
        <button type="submit" disabled={pin.length < 4} className="mt-3 h-11 w-full rounded-full bg-surface-2 text-ink disabled:opacity-40">
          Desbloquear
        </button>
      </form>
    </div>
  )
}
