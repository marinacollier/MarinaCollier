/**
 * Pausa antes de decidir: como estou (opcional) → uma técnica sugerida → rascunho (Modo Pausa) → revisar →
 * copiar, editar ou descartar. Nada bloqueia: qualquer passo pode ser pulado, e nada é enviado.
 */
import { useState } from 'react'
import { Button, Card } from '@/components/ui'
import { useDB } from '@/data/store'
import { cn } from '@/lib/cn'
import { copyWithFeedback, TechniqueCard } from '../parts'
import { pauseMessage } from '../pause'
import { QUICK_OPTIONS, quickTechniques, type QuickId } from '../quick'
import { techniqueById } from '../techniques'
import { DEFAULT_CHOICE, PauseComposer } from './Pause'

const STEPS = ['Como estou', 'Uma técnica', 'Rascunho', 'Revisar'] as const
const FEELINGS = QUICK_OPTIONS.filter((q) => q.id !== 'escrever' && q.id !== 'conversar')
const INITIAL = { ...DEFAULT_CHOICE, intent: 'nao_decidir_agora' as const }

export function Decide() {
  const name = useDB((db) => db.profile.name)
  const [step, setStep] = useState(0)
  const [feeling, setFeeling] = useState<QuickId | undefined>()
  const [text, setText] = useState(() => pauseMessage({ ...INITIAL, name }))
  const [composerKey, setComposerKey] = useState(0)
  const technique = feeling ? quickTechniques(feeling)[0] : techniqueById('stop')

  const restart = () => {
    setStep(0)
    setFeeling(undefined)
    setText(pauseMessage({ ...INITIAL, name }))
    setComposerKey((k) => k + 1)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-[24px] leading-tight">Pausa antes de decidir</h2>
        <p className="text-muted text-[14px] mt-1">Quatro passos curtos. Pule o que quiser.</p>
      </div>

      <ol className="flex gap-1.5" aria-label="Passos">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined} className="w-full text-left">
              <span className={cn('block h-1.5 rounded-full', i <= step ? 'bg-accent' : 'bg-surface-2')} />
              <span className={cn('block text-[11.5px] mt-1', i === step ? 'text-ink font-medium' : 'text-muted')}>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-3">
          <p className="text-[15px]">Se quiser, diga como você está agora (opcional).</p>
          <div className="flex flex-wrap gap-2">
            {FEELINGS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={feeling === f.id}
                onClick={() => setFeeling(feeling === f.id ? undefined : f.id)}
                className={cn('h-10 px-3.5 rounded-full text-[13.5px]', feeling === f.id ? 'bg-ink text-bg' : 'bg-surface-2')}
              >
                {f.emoji} {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && technique && (
        <div className="space-y-3">
          <p className="text-[15px]">Antes de escrever, uma técnica rápida pode ajudar:</p>
          <TechniqueCard t={technique} />
        </div>
      )}

      {/* Kept mounted (hidden) so going back and forth keeps her edits. */}
      <div hidden={step !== 2}>
        <PauseComposer key={composerKey} initial={INITIAL} onChange={setText} />
      </div>

      {step === 3 && (
        <Card className="space-y-3">
          <p className="text-[13px] text-muted">Leia com calma. Se ainda fizer sentido, copie; se não, edite ou descarte.</p>
          <p className="text-[15px] leading-relaxed whitespace-pre-line rounded-2xl bg-surface-2 p-3" aria-label="Mensagem para revisar">
            {text || 'O rascunho está vazio.'}
          </p>
          <p className="text-[12.5px] font-semibold text-accent">Você envia. O app nunca envia nada sozinho.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void copyWithFeedback(text)} disabled={!text.trim()}>
              Copiar
            </Button>
            <Button variant="soft" onClick={() => setStep(2)}>
              Editar
            </Button>
            <Button variant="ghost" onClick={restart}>
              Descartar
            </Button>
          </div>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          Voltar
        </Button>
        {step < STEPS.length - 1 && <Button onClick={() => setStep(step + 1)}>{step === 0 && !feeling ? 'Pular' : 'Próximo'}</Button>}
      </div>
    </div>
  )
}
