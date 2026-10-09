/**
 * "Conta do MARINA OS" — sign in to the app's own backend (Supabase Auth, e-mail + 6-digit code).
 * Shown only when the server is configured; needed for reading prints/PDFs and for integrations.
 */
import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui'
import { toast } from '@/app/ui-store'
import { authAvailable, sendCode, signOut, useAuth, verifyCode } from '@/integrations/auth'
import { haptic } from '@/lib/haptics'

export function AccountSection() {
  const auth = useAuth()
  const [email, setEmail] = useState(auth.email ?? '')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  if (!authAvailable()) return null

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setErr(undefined)
    try {
      await fn()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não deu certo agora.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-4 mt-4" aria-label="Conta do MARINA OS">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-2xl bg-accent-soft text-accent flex items-center justify-center shrink-0" aria-hidden>
          <KeyRound size={19} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium">Conta do MARINA OS</div>
          <p className="text-[13px] text-muted leading-snug mt-0.5">
            {auth.signedIn ? `Conectada como ${auth.email ?? 'você'}. A Lumos já pode ler prints e PDFs.` : 'Entre com seu e-mail para a Lumos ler prints e PDFs e para as integrações. Sem senha: chega um código.'}
          </p>
        </div>
      </div>
      {auth.signedIn ? (
        <Button variant="ghost" className="mt-3" onClick={() => run(async () => { await signOut(); toast('Você saiu da conta') })}>
          Sair
        </Button>
      ) : step === 'email' ? (
        <div className="mt-3 flex gap-2">
          <input className="input flex-1" type="email" inputMode="email" autoComplete="email" placeholder="seu e-mail" aria-label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button disabled={busy || !/\S+@\S+/.test(email)} onClick={() => run(async () => { await sendCode(email); setStep('code'); toast('Código enviado pro seu e-mail') })}>
            Enviar código
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <input className="input flex-1 tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" placeholder="código" aria-label="Código" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} />
          <Button disabled={busy || code.length < 6} onClick={() => run(async () => { await verifyCode(email, code); haptic('success'); toast('Conta conectada ✓', { tone: 'win' }) })}>
            Entrar
          </Button>
        </div>
      )}
      {err && <p className="text-[13px] text-sand mt-2">{err}</p>}
    </section>
  )
}
