/** Ajustes → Privacidade → Trava: código sempre; Face ID por cima quando o aparelho tem. Nada de biometria falsa. */
import { useEffect, useState } from 'react'
import { lockSession, unlockSession } from '@/app/lock-store'
import { toast } from '@/app/ui-store'
import { actions, useDB } from '@/data/store'
import type { LockArea, PrivacyLock } from '@/data/types'
import { Button, Segmented } from '@/components/ui'
import { biometricAvailable, hashPin, registerBiometric, validPin, verifyPin } from '@/lib/lock'
import { cn } from '@/lib/cn'

const AREAS: { id: LockArea; label: string }[] = [
  { id: 'dinheiro', label: 'Dinheiro e contratos' },
  { id: 'carreira', label: 'Carreira' },
]

const PinInput = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
    inputMode="numeric"
    type="password"
    autoComplete="off"
    aria-label={label}
    placeholder={label}
    className="input tracking-[0.3em]"
  />
)

export function PrivacyLockSection() {
  const lock = useDB((db) => db.profile.privacyLock)
  const name = useDB((db) => db.profile.name)
  const [bioOk, setBioOk] = useState(false)
  const [mode, setMode] = useState<'idle' | 'setup' | 'change' | 'off'>('idle')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [areas, setAreas] = useState<LockArea[]>(lock?.areas ?? ['dinheiro', 'carreira'])
  const [err, setErr] = useState<string>()

  useEffect(() => void biometricAvailable().then(setBioOk), [])

  const save = (patch: Partial<PrivacyLock>) => actions.setProfile({ privacyLock: { ...(lock as PrivacyLock), ...patch } })
  const reset = () => {
    setMode('idle')
    setA('')
    setB('')
    setErr(undefined)
  }

  const enable = async () => {
    if (!validPin(a)) return setErr('Use de 4 a 8 números.')
    if (a !== b) return setErr('Os dois códigos não batem.')
    const { hash, salt } = await hashPin(a)
    actions.setProfile({ privacyLock: { enabled: true, areas, pinHash: hash, pinSalt: salt, relockMinutes: 5 } })
    unlockSession()
    reset()
    toast('Trava ligada 🔒')
  }

  const addFaceId = async () => {
    const id = await registerBiometric(name || 'Marina')
    if (id) {
      save({ credentialId: id })
      toast('Face ID ligado ✓')
    } else toast('Face ID não foi configurado — o código continua valendo.')
  }

  const changePin = async () => {
    if (!lock || !(await verifyPin(a, lock))) return setErr('O código atual não confere.')
    if (!validPin(b)) return setErr('O novo código precisa ter de 4 a 8 números.')
    const { hash, salt } = await hashPin(b)
    save({ pinHash: hash, pinSalt: salt })
    reset()
    toast('Código trocado ✓')
  }

  const disable = async () => {
    if (!lock || !(await verifyPin(a, lock))) return setErr('O código não confere.')
    actions.setProfile({ privacyLock: undefined })
    lockSession()
    reset()
    toast('Trava desligada')
  }

  const toggleArea = (id: LockArea) => {
    const next = areas.includes(id) ? areas.filter((x) => x !== id) : [...areas, id]
    setAreas(next)
    if (lock?.enabled) save({ areas: next })
  }

  return (
    <section className="card p-4 mt-5" aria-label="Trava de privacidade">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15.5px] font-medium">Trava de privacidade</h2>
          <p className="text-[13px] text-muted mt-0.5 leading-snug">
            Pede {lock?.credentialId ? 'Face ID ou código' : 'um código'} para abrir as áreas escolhidas. É uma trava de tela no aparelho — não criptografa os dados.
          </p>
        </div>
        <span className={cn('shrink-0 h-6 px-2.5 rounded-full text-[12px] inline-flex items-center', lock?.enabled ? 'bg-sage-soft text-sage' : 'bg-surface-2 text-muted')}>{lock?.enabled ? 'ligada' : 'desligada'}</span>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {AREAS.map((x) => (
          <button key={x.id} type="button" aria-pressed={areas.includes(x.id)} onClick={() => toggleArea(x.id)} className={cn('h-9 px-3.5 rounded-full border text-[13px]', areas.includes(x.id) ? 'bg-ink text-bg border-ink' : 'border-line text-ink-2')}>
            {x.label}
          </button>
        ))}
      </div>

      {!lock?.enabled && mode !== 'setup' && (
        <Button variant="primary" className="mt-4" onClick={() => setMode('setup')} disabled={!areas.length}>
          Ligar trava
        </Button>
      )}

      {mode === 'setup' && (
        <div className="mt-4 space-y-2.5">
          <PinInput value={a} onChange={setA} label="novo código (4 a 8 números)" />
          <PinInput value={b} onChange={setB} label="repita o código" />
          {err && <p className="text-[13px] text-sand">{err}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset}>
              Cancelar
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => void enable()}>
              Ligar com este código
            </Button>
          </div>
        </div>
      )}

      {lock?.enabled && mode === 'idle' && (
        <div className="mt-4 space-y-3">
          {bioOk ? (
            lock.credentialId ? (
              <div className="flex items-center justify-between">
                <span className="text-[14px]">Face ID ligado</span>
                <Button variant="ghost" onClick={() => save({ credentialId: undefined })}>
                  Usar só o código
                </Button>
              </div>
            ) : (
              <Button variant="soft" onClick={() => void addFaceId()}>
                Usar Face ID também
              </Button>
            )
          ) : (
            <p className="text-[12.5px] text-muted">Face ID não está disponível neste aparelho/navegador — a trava usa o código.</p>
          )}
          <div>
            <div className="text-[13px] text-ink-2 mb-1.5">Trancar de novo depois de</div>
            <Segmented
              value={String(lock.relockMinutes)}
              onChange={(v) => save({ relockMinutes: Number(v) })}
              options={[
                { value: '1', label: '1 min' },
                { value: '5', label: '5 min' },
                { value: '15', label: '15 min' },
              ]}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setMode('change')}>
              Trocar código
            </Button>
            <Button variant="ghost" onClick={() => setMode('off')}>
              Desligar trava
            </Button>
          </div>
        </div>
      )}

      {(mode === 'change' || mode === 'off') && (
        <div className="mt-4 space-y-2.5">
          <PinInput value={a} onChange={setA} label="código atual" />
          {mode === 'change' && <PinInput value={b} onChange={setB} label="novo código" />}
          {err && <p className="text-[13px] text-sand">{err}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset}>
              Cancelar
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => void (mode === 'change' ? changePin() : disable())}>
              {mode === 'change' ? 'Trocar' : 'Desligar'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
