/**
 * "Escrever abordagem" on a brand: the strategy first (what to talk about, what to avoid, the angle, the TRUE
 * brand detail and the relationship), then a text she edits, copies and sends HERSELF.
 * - Relationship unknown → ONE question (Já usou?) before anything is written.
 * - "Gerar" keeps a draft (rascunho); copying approves it; "Mandei" marks it sent and logs the contact.
 * - Nothing is ever sent by the app.
 */
import { useMemo, useState } from 'react'
import { Card, Field, SectionTitle, TextArea } from '@/components/ui'
import { toast } from '@/app/ui-store'
import { useDB } from '@/data/store'
import type { Brand, BrandFact, UgcChannel } from '@/data/types'
import { CHANNEL_LABEL, CHANNELS, currentOpportunity } from '@/data/ugc/model'
import { buildStrategy, checkText, describeFact } from '@/data/ugc/strategy'
import { nextDraft } from '@/data/ugc/compose'
import { addBrandFact, approveMessage, discardMessage, editDraft, markMessageSent, removeBrandFact, saveDraft, setRelationship } from '@/data/ugc/ops'
import { useToday } from '@/hooks/useToday'
import { cn } from '@/lib/cn'
import { formatDayMonth } from '@/lib/date'
import { commit } from './parts'
import { writeMessage } from './write'

const SOURCES: { value: BrandFact['source']; label: string }[] = [
  { value: 'marina', label: 'Eu sei' },
  { value: 'site', label: 'Site' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'print', label: 'Print' },
  { value: 'outro', label: 'Outro' },
]

const STATUS = { rascunho: 'rascunho', aprovada: 'aprovada', enviada: 'enviada', descartada: 'descartada' } as const

function openTarget(brand: Brand, channel: UgcChannel, text: string, subject?: string): { label: string; url: string } | undefined {
  const ig = brand.instagram?.replace(/^@/, '').trim()
  if (channel === 'dm' && ig) return { label: 'Copiar e abrir Instagram', url: `https://ig.me/m/${encodeURIComponent(ig)}` }
  const mail = brand.contactChannels?.find((c) => c.channel === 'email')?.value
  if (channel === 'email' && mail) return { label: 'Abrir no e-mail', url: `mailto:${mail}?subject=${encodeURIComponent(subject ?? '')}&body=${encodeURIComponent(text)}` }
  return undefined
}

export function WriteSection({ brand }: { brand: Brand }) {
  const today = useToday()
  const db = useDB((d) => d)
  const opportunity = currentOpportunity(db, brand.id)
  const [channel, setChannel] = useState<UgcChannel>(opportunity?.primaryChannel ?? 'dm')
  const strategy = useMemo(() => buildStrategy(db, brand.id, channel, today, opportunity), [db, brand.id, channel, today, opportunity])
  const messages = useMemo(() => db.ugcMessages.filter((m) => m.brandId === brand.id && m.status !== 'descartada').sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.ugcMessages, brand.id])
  const [currentId, setCurrentId] = useState<string | undefined>(() => messages.find((m) => m.status !== 'enviada')?.id)
  const current = messages.find((m) => m.id === currentId)
  const [text, setText] = useState(current?.approvedText ?? current?.generatedText ?? '')
  const [subject, setSubject] = useState<string | undefined>(() => current?.strategy?.match(/Assunto: (.+)$/)?.[1])
  const [variant, setVariant] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | undefined>()
  const [fact, setFact] = useState('')
  const [factSource, setFactSource] = useState<BrandFact['source']>('marina')
  const [factUrl, setFactUrl] = useState('')

  if (!strategy) return null
  const askRelationship = strategy.missing.includes('relação')
  const issues = text.trim() ? checkText(strategy, text, subject).issues : []

  const generate = async (again = false) => {
    setBusy(true)
    try {
      const seed = again ? variant + 1 : variant
      let out = await writeMessage(strategy, { seed })
      if (again && out.by === 'local' && out.text === text) out = { ...nextDraft(strategy, out), by: 'local' }
      const saved = saveDraft(strategy, out.text, opportunity?.id, out.subject)
      setCurrentId(saved.message.id)
      setText(out.text)
      setSubject(out.subject)
      setVariant(out.variant)
      setNote(out.note)
      commit(() => saved.undo, 'Rascunho guardado — nada foi enviado')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (url?: string) => {
    if (!current) return
    const full = subject ? `${subject}\n\n${text}` : text
    try {
      await navigator.clipboard.writeText(channel === 'email' && url ? text : full)
    } catch {
      toast('Não consegui copiar — selecione o texto e copie')
      return
    }
    commit(() => approveMessage(current.id, text), 'Copiado ✓ agora é só colar e enviar')
    if (url) window.open(url, '_blank', 'noopener')
  }

  const target = openTarget(brand, channel, text, subject)

  return (
    <section aria-label="Escrever abordagem">
      <SectionTitle>Escrever abordagem</SectionTitle>
      <Card className="space-y-4">
        <div role="radiogroup" aria-label="Canal" className="flex flex-wrap gap-1.5">
          {CHANNELS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={channel === c} onClick={() => setChannel(c)} className={cn('h-8 px-2.5 rounded-full text-[12.5px]', channel === c ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
              {CHANNEL_LABEL[c]}
            </button>
          ))}
        </div>

        {askRelationship ? (
          <div className="space-y-2">
            <p className="text-[14.5px]">Antes de escrever: você já usou {brand.name}?</p>
            <div className="flex gap-2">
              <button type="button" className="h-10 px-4 rounded-full bg-ink text-bg text-[13.5px] font-medium" onClick={() => commit(() => setRelationship(brand.id, { alreadyUsedProduct: true }), 'Anotado: já usou')}>
                Já usei
              </button>
              <button type="button" className="h-10 px-4 rounded-full bg-surface-2 text-[13.5px]" onClick={() => commit(() => setRelationship(brand.id, { alreadyUsedProduct: false, alreadyCustomer: false }), 'Anotado: nunca usou')}>
                Nunca usei
              </button>
            </div>
            <p className="text-[12.5px] text-muted">Assim a mensagem nunca diz algo que não aconteceu.</p>
          </div>
        ) : (
          <>
            <dl className="text-[13.5px] space-y-1.5" aria-label="Estratégia">
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Falar de</dt><dd>{strategy.talk.join(' + ') || '—'}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Evitar</dt><dd>{strategy.avoid.slice(0, 4).join(', ') || '—'}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Ângulo</dt><dd>{strategy.angle}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Fato</dt><dd>{strategy.fact ? describeFact(strategy.fact) : 'nenhum — não vou elogiar nada específico'}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Relação</dt><dd>{strategy.relationship.say}</dd></div>
            </dl>
            {strategy.warnings.map((w) => (
              <p key={w} className="text-[12.5px] text-amber-700 dark:text-amber-300">{w}</p>
            ))}

            {current ? (
              <div className="space-y-2">
                {subject && <p className="text-[13.5px]"><span className="text-muted">Assunto:</span> {subject}</p>}
                <TextArea aria-label="Mensagem" rows={channel === 'email' ? 10 : 6} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== (current.approvedText ?? current.generatedText) && commit(() => editDraft(current.id, text), 'Texto salvo')} />
                <p className="text-[12px] text-muted">
                  {text.trim().split(/\s+/).filter(Boolean).length} palavras · {STATUS[current.status]}
                  {note ? ` · ${note}` : ''}
                </p>
                {issues.map((i) => (
                  <p key={i} className="text-[12.5px] text-amber-700 dark:text-amber-300">⚠︎ {i}</p>
                ))}
                {current.status !== 'enviada' && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="h-10 px-4 rounded-full bg-ink text-bg text-[13.5px] font-medium" onClick={() => void copy()}>
                      Copiar
                    </button>
                    {target && (
                      <button type="button" className="h-10 px-4 rounded-full bg-surface-2 text-[13.5px]" onClick={() => void copy(target.url)}>
                        {target.label}
                      </button>
                    )}
                    <button type="button" disabled={busy} className="h-10 px-4 rounded-full bg-surface-2 text-[13.5px]" onClick={() => void generate(true)}>
                      Outra versão
                    </button>
                    <button type="button" className="h-10 px-4 rounded-full bg-accent-soft text-accent text-[13.5px] font-medium" onClick={() => commit(() => markMessageSent(current.id, { date: today }), `Enviada ✓ contato registrado em ${brand.name}`)}>
                      Mandei
                    </button>
                    <button type="button" className="h-10 px-3 text-[13px] text-muted" onClick={() => { commit(() => discardMessage(current.id), 'Rascunho descartado'); setCurrentId(undefined); setText('') }}>
                      Descartar
                    </button>
                  </div>
                )}
                {current.status === 'enviada' && (
                  <button type="button" disabled={busy} className="h-10 px-4 rounded-full bg-surface-2 text-[13.5px]" onClick={() => void generate(true)}>
                    Escrever outra
                  </button>
                )}
              </div>
            ) : (
              <button type="button" disabled={busy} className="h-11 px-5 rounded-full bg-ink text-bg text-[14px] font-medium" onClick={() => void generate()}>
                {busy ? 'Escrevendo…' : `Gerar ${CHANNEL_LABEL[channel]}`}
              </button>
            )}
            <p className="text-[12px] text-muted">Nada é enviado pelo app — você revisa, copia e manda.</p>
          </>
        )}

        {/* Brand facts — true details, always with where they came from */}
        <div className="space-y-2 pt-1 border-t border-line/70">
          <p className="text-[13.5px] font-medium pt-3">Detalhes reais da marca</p>
          {(brand.personalizationFacts ?? []).length ? (
            <ul className="space-y-1.5">
              {brand.personalizationFacts!.map((f, i) => (
                <li key={`${f.text}-${i}`} className="flex items-start gap-2 text-[13.5px]">
                  <span className="flex-1">{describeFact(f)}{f.sourceUrl && <span className="block text-[12px] text-muted truncate">{f.sourceUrl}</span>}</span>
                  <button type="button" aria-label={`Remover: ${f.text}`} className="text-[12.5px] text-muted h-8 px-1" onClick={() => commit(() => removeBrandFact(brand.id, i), 'Removido')}>
                    remover
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-muted">Um lançamento, uma campanha, um atleta, uma expedição — algo que você viu de verdade.</p>
          )}
          <Field label="Novo detalhe">
            <input className="input w-full" value={fact} onChange={(e) => setFact(e.target.value)} placeholder="ex.: a campanha nova com corredores de trilha" />
          </Field>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Fonte">
            {SOURCES.map((s) => (
              <button key={s.value} type="button" role="radio" aria-checked={factSource === s.value} onClick={() => setFactSource(s.value)} className={cn('h-8 px-2.5 rounded-full text-[12.5px]', factSource === s.value ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
                {s.label}
              </button>
            ))}
          </div>
          {factSource !== 'marina' && <input className="input w-full" value={factUrl} onChange={(e) => setFactUrl(e.target.value)} placeholder="link (opcional)" aria-label="Link da fonte" />}
          <button
            type="button"
            disabled={!fact.trim()}
            className="h-9 px-4 rounded-full bg-surface-2 text-[13px] disabled:opacity-50"
            onClick={() => {
              commit(() => addBrandFact(brand.id, { text: fact, source: factSource, sourceUrl: factUrl }), 'Detalhe guardado ✓')
              setFact('')
              setFactUrl('')
            }}
          >
            Guardar detalhe
          </button>
        </div>

        {messages.some((m) => m.status === 'enviada') && (
          <div className="pt-1 border-t border-line/70">
            <p className="text-[13.5px] font-medium pt-3 mb-1">Mensagens enviadas</p>
            <ul className="space-y-2">
              {messages.filter((m) => m.status === 'enviada').map((m) => (
                <li key={m.id} className="text-[13px]">
                  <span className="text-muted">{m.sentAt ? formatDayMonth(m.sentAt.slice(0, 10)) : ''} · {CHANNEL_LABEL[m.channel]}</span>
                  <span className="block whitespace-pre-line">{m.sentText}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </section>
  )
}
