import { useEffect, useState } from 'react'
import { Button, Chip, SheetLayout } from '@/components/ui'
import { useDB } from '@/data/store'
import type { LearningTemplate } from '@/data/types'
import { LANG_DOMAIN, templatesOf } from '../engine/model'
import type { LoggerDefaults } from './SessionLogger'

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s) % 60)).padStart(2, '0')}`

/**
 * "Iniciar sessão": template steps with a simple timer. It counts only while the app is open — no
 * background claims. "Concluir" opens the logger with the real minutes and the skills of the steps done.
 */
export function SessionTimer({ initialTemplate, onDone, onClose }: { initialTemplate?: string; onDone: (d: LoggerDefaults) => void; onClose: () => void }) {
  const db = useDB()
  const templates = templatesOf(db)
  const [tpl, setTpl] = useState<LearningTemplate | undefined>(templates.find((t) => t.id === initialTemplate))
  const [step, setStep] = useState(0)
  const [startedAt, setStartedAt] = useState<number | undefined>()
  const [stepStartedAt, setStepStartedAt] = useState<number | undefined>()
  const [, tick] = useState(0)

  useEffect(() => {
    if (!startedAt) return
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [startedAt])

  if (!tpl) {
    return (
      <SheetLayout title="Iniciar sessão" eyebrow="escolha um modelo" onClose={onClose}>
        <div className="space-y-2">
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => setTpl(t)} className="w-full text-left rounded-2xl bg-surface-2 p-4 active:scale-[0.99] transition">
              <div className="font-medium">{t.name}</div>
              <div className="text-[13px] text-muted">{t.steps.map((s) => `${s.minutes} ${s.label.toLowerCase()}`).join(' + ')}</div>
            </button>
          ))}
        </div>
      </SheetLayout>
    )
  }

  const now = Date.now()
  const cur = tpl.steps[step]
  const left = cur && stepStartedAt ? cur.minutes * 60 - (now - stepStartedAt) / 1000 : (cur?.minutes ?? 0) * 60
  const elapsedMin = startedAt ? Math.max(1, Math.round((now - startedAt) / 60000)) : 0
  const finish = () => {
    const skills = [...new Set(tpl.steps.slice(0, step + 1).flatMap((s) => s.skills ?? []))]
    onDone({ domain: tpl.domain ?? (tpl.trackId ? LANG_DOMAIN : undefined), trackId: tpl.trackId, minutes: elapsedMin || tpl.steps.reduce((s, x) => s + x.minutes, 0), skills })
  }

  return (
    <SheetLayout title={tpl.name} eyebrow="sessão" onClose={onClose} primary={{ label: startedAt ? 'Concluir e registrar' : 'Começar', onClick: startedAt ? finish : () => (setStartedAt(Date.now()), setStepStartedAt(Date.now())) }}>
      <ol className="space-y-2">
        {tpl.steps.map((s, i) => (
          <li key={i} className={`rounded-2xl p-3.5 flex items-center justify-between ${i === step ? 'bg-surface-2' : ''} ${i < step ? 'opacity-50' : ''}`}>
            <span>
              {i + 1}. {s.label}
            </span>
            <span className="tabular-nums text-[14px] text-muted">{i === step && startedAt ? mmss(left) : `${s.minutes} min`}</span>
          </li>
        ))}
      </ol>
      {startedAt && (
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <Button variant="soft" size="sm" disabled={step >= tpl.steps.length - 1} onClick={() => (setStep(step + 1), setStepStartedAt(Date.now()))}>
            Próxima etapa
          </Button>
          <Chip>{elapsedMin} min até agora</Chip>
        </div>
      )}
      <p className="text-[12.5px] text-muted mt-4">O cronômetro conta só com o app aberto. Os minutos ficam editáveis antes de salvar.</p>
    </SheetLayout>
  )
}
