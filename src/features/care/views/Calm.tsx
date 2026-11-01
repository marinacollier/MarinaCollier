/**
 * "Preciso me acalmar": 8 portas, técnicas curtas primeiro, o 5-4-3-2-1 guiado (toque para avançar, sem
 * cronômetro), o rascunho NÃO salvo de "quero escrever" e o caminho para conversar.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { Button, Card, SectionTitle, TextArea } from '@/components/ui'
import { cn } from '@/lib/cn'
import { TechniqueCard } from '../parts'
import { QUICK_OPTIONS, quickOption, quickTechniques, type QuickId } from '../quick'
import { GROUNDING_STEPS } from '../techniques'

export function Grounding({ onClose }: { onClose?: () => void }) {
  const [step, setStep] = useState(0)
  const done = step >= GROUNDING_STEPS.length
  const s = GROUNDING_STEPS[step]
  return (
    <Card className="space-y-4" aria-live="polite">
      <div className="eyebrow">5-4-3-2-1 · no seu ritmo</div>
      {done ? (
        <>
          <p className="text-[17px] leading-relaxed">Respire uma vez devagar. O que mudou, mesmo que pouco?</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" onClick={() => setStep(0)}>
              Fazer de novo
            </Button>
            {onClose && (
              <Button variant="ghost" onClick={onClose}>
                Fechar
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[44px] leading-none">{s.count}</span>
            <span className="text-muted text-[14px]">coisas para {s.sense}</span>
          </div>
          <p className="text-[17px] leading-relaxed">{s.prompt}</p>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                Voltar
              </Button>
            )}
            <Button onClick={() => setStep(step + 1)}>{step === GROUNDING_STEPS.length - 1 ? 'Terminei' : 'Próximo'}</Button>
          </div>
          <div className="flex gap-1.5" aria-hidden>
            {GROUNDING_STEPS.map((g, i) => (
              <span key={g.count} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-accent' : 'bg-surface-2')} />
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

/** Rascunho temporário: só em memória, some ao sair. Nada vai para o banco. */
function Scratch() {
  const [text, setText] = useState('')
  return (
    <Card className="space-y-3">
      <p className="text-[14.5px] leading-relaxed">
        O diário privado ainda não está disponível: a proteção dele está sendo finalizada, e eu não quero prometer uma privacidade que o app ainda não
        oferece.{' '}
        <a href="#por-que-diario" className="underline">
          Entenda por quê
        </a>
        .
      </p>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[13px] font-medium">Rascunho temporário</span>
          <span className="text-[12px] font-semibold text-accent">não é salvo</span>
        </div>
        <TextArea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva o que quiser. Ao sair desta tela, tudo some." aria-label="Rascunho temporário, não é salvo" />
        <p className="text-[12px] text-muted mt-1.5">Fica só nesta tela enquanto ela estiver aberta. Não vai para o aparelho, para a nuvem nem para o backup.</p>
      </div>
      {text && (
        <Button variant="ghost" size="sm" onClick={() => setText('')}>
          Apagar agora
        </Button>
      )}
    </Card>
  )
}

export function Calm() {
  const nav = useNavigate()
  const [picked, setPicked] = useState<QuickId | undefined>()
  const [grounding, setGrounding] = useState(false)
  const option = picked ? quickOption(picked) : undefined

  return (
    <div className="space-y-6">
      <section aria-label="Preciso me acalmar">
        <h2 className="font-display text-[24px] leading-tight">Preciso me acalmar</h2>
        <p className="text-muted text-[14px] mt-1">Escolha o que está mais perto de agora. Sem certo ou errado.</p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {QUICK_OPTIONS.map((q) => (
            <button
              key={q.id}
              type="button"
              aria-pressed={picked === q.id}
              onClick={() => setPicked(picked === q.id ? undefined : q.id)}
              className={cn('min-h-[64px] rounded-2xl px-3 py-2.5 text-left text-[14.5px] leading-snug flex items-center gap-2.5 transition active:scale-[0.98]', picked === q.id ? 'bg-ink text-bg' : 'bg-surface-2')}
            >
              <span aria-hidden className="text-[20px]">
                {q.emoji}
              </span>
              <span>{q.label}</span>
            </button>
          ))}
        </div>
      </section>

      {option && (
        <section aria-label={option.label} className="space-y-3">
          <p className="text-[15px] leading-relaxed">{option.intro}</p>
          {option.kind === 'write' && <Scratch />}
          {option.kind === 'talk' && (
            <Card className="space-y-2">
              <p className="text-[14.5px]">Ligue ou mande mensagem para alguém do seu plano de apoio. Se for urgente, a ajuda humana (CVV 188, SAMU 192) está lá também.</p>
            </Card>
          )}
          {option.link && (
            <Button variant="accent" block onClick={() => nav(option.link!.to)}>
              {option.link.label}
            </Button>
          )}
          {quickTechniques(option.id).map((t) => (
            <TechniqueCard key={t.id} t={t} />
          ))}
        </section>
      )}

      <section aria-label="5-4-3-2-1 guiado">
        <SectionTitle>Aterramento guiado</SectionTitle>
        {grounding ? (
          <Grounding onClose={() => setGrounding(false)} />
        ) : (
          <Button variant="soft" block onClick={() => setGrounding(true)}>
            Fazer o 5-4-3-2-1 passo a passo
          </Button>
        )}
      </section>

      <section id="por-que-diario" aria-label="Por que o diário ainda não existe" className="text-[13.5px] text-muted leading-relaxed space-y-2">
        <SectionTitle>Por que ainda não há diário</SectionTitle>
        <p>
          Hoje os dados do app ficam no aparelho sem criptografia e, para não se perderem, podem ir para a sua área na nuvem do Claude (só você acessa, mas o
          conteúdo não é cifrado) e para o seu backup em texto aberto.
        </p>
        <p>Para um diário íntimo isso não basta. Ele só vai existir quando houver proteção de verdade (por exemplo, criptografia com uma frase-senha só sua) ou quando você escolher conscientemente outra opção.</p>
        <p>
          O que existe aqui hoje (técnicas favoritas, rascunhos de mensagem que você decidir guardar, plano de apoio) nunca vai para o Supabase nem para as
          exportações em planilha. <Link to={ROUTES.careTab('apoio')} className="underline">Ver plano de apoio</Link>
        </p>
      </section>
    </div>
  )
}
