/**
 * Modo Pausa: contexto × intenção × tom → mensagem editável. Copiar (API real, com aviso honesto se falhar),
 * abrir WhatsApp / e-mail com o texto, ou copiar e abrir o Instagram. O app NUNCA envia: você envia.
 * Rascunho só se ela quiser guardar, e o aviso vem depois de gravado no aparelho.
 */
import { useState } from 'react'
import { toast } from '@/app/ui-store'
import { Button, Card, ChipSelect, SectionTitle, TextArea } from '@/components/ui'
import { useDB } from '@/data/store'
import type { PauseContext, PauseIntent, PauseTone } from '@/data/types'
import { actions } from '@/data/store'
import { removePauseDraft, savePauseDraft } from '../ops'
import { copyText, copyWithFeedback } from '../parts'
import { INSTAGRAM_INBOX, mailtoUrl, PAUSE_CONTEXTS, PAUSE_INTENTS, PAUSE_TONES, pauseMessage, whatsappUrl } from '../pause'

export interface PauseChoice {
  context: PauseContext
  intent: PauseIntent
  tone: PauseTone
}

export const DEFAULT_CHOICE: PauseChoice = { context: 'pessoal', intent: 'tempo', tone: 'delicado' }

const linkCls = 'inline-flex items-center justify-center h-11 px-4 rounded-full text-[14px] font-medium bg-surface-2 text-ink active:bg-line'

export function PauseComposer({
  initial,
  onDiscard,
  onSaved,
  onChange,
}: {
  initial?: Partial<PauseChoice>
  onDiscard?: () => void
  onSaved?: () => void
  /** Lets a stepper (Pausa antes de decidir) review the current text. */
  onChange?: (text: string) => void
}) {
  const name = useDB((db) => db.profile.name)
  const [choice, setChoice] = useState<PauseChoice>({ ...DEFAULT_CHOICE, ...initial })
  const [text, setTextState] = useState(() => pauseMessage({ ...DEFAULT_CHOICE, ...initial, name }))
  const setText = (t: string) => {
    setTextState(t)
    onChange?.(t)
  }
  const [saving, setSaving] = useState(false)

  const pick = (patch: Partial<PauseChoice>) => {
    const next = { ...choice, ...patch }
    setChoice(next)
    setText(pauseMessage({ ...next, name }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const r = await savePauseDraft({ ...choice, text })
      if (r.ok) {
        toast('Rascunho guardado neste aparelho. Nada foi enviado.')
        onSaved?.()
      } else if (r.draft) toast('Não consegui gravar no aparelho agora. Copie o texto para não perder.')
      else toast('O rascunho está vazio.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[13px] font-medium mb-1.5">Com quem / onde</div>
        <ChipSelect value={choice.context} onChange={(v) => v && pick({ context: v })} options={PAUSE_CONTEXTS} />
      </div>
      <div>
        <div className="text-[13px] font-medium mb-1.5">O que você precisa</div>
        <ChipSelect value={choice.intent} onChange={(v) => v && pick({ intent: v })} options={PAUSE_INTENTS} />
      </div>
      <div>
        <div className="text-[13px] font-medium mb-1.5">Tom</div>
        <ChipSelect value={choice.tone} onChange={(v) => v && pick({ tone: v })} options={PAUSE_TONES} />
      </div>

      <Card className="space-y-3">
        <TextArea rows={choice.context === 'email' ? 9 : 5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Mensagem (editável)" />
        <p className="text-[12.5px] font-semibold text-accent">Você envia. O app nunca envia nada sozinho.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void copyWithFeedback(text)} disabled={!text.trim()}>
            Copiar
          </Button>
          <a className={linkCls} href={whatsappUrl(text)} target="_blank" rel="noopener noreferrer">
            Abrir WhatsApp
          </a>
          <a className={linkCls} href={mailtoUrl(text)}>
            Abrir e-mail
          </a>
          <a
            className={linkCls}
            href={INSTAGRAM_INBOX}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              void copyText(text).then((ok) => toast(ok ? 'Copiado. Cole na conversa do Instagram — você envia.' : 'Não consegui copiar. Volte, selecione o texto e copie.'))
            }}
          >
            Copiar e abrir Instagram
          </a>
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="soft" size="sm" onClick={() => void save()} disabled={saving || !text.trim()}>
            Guardar rascunho
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setText(pauseMessage({ ...choice, name }))
              onDiscard?.()
            }}
          >
            Descartar edição
          </Button>
        </div>
      </Card>
    </div>
  )
}

function SavedDrafts() {
  const drafts = useDB((db) => db.carePauseDrafts ?? [])
  if (!drafts.length) return null
  const sorted = [...drafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <section aria-label="Rascunhos guardados" className="space-y-2">
      <SectionTitle>Rascunhos guardados</SectionTitle>
      {sorted.map((d) => (
        <Card key={d.id} className="space-y-2">
          <p className="text-[14px] whitespace-pre-line leading-relaxed">{d.text}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="soft" onClick={() => void copyWithFeedback(d.text)}>
              Copiar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const removed = removePauseDraft(d.id)
                if (removed) toast('Rascunho apagado.', { action: { label: 'Desfazer', run: () => actions.restore('carePauseDrafts', removed) } })
              }}
            >
              Apagar
            </Button>
          </div>
        </Card>
      ))}
    </section>
  )
}

const isIn = <T extends string>(v: string | null, list: { value: T }[]): T | undefined => (list.some((o) => o.value === v) ? (v as T) : undefined)

export function Pause({ params }: { params: URLSearchParams }) {
  const initial: Partial<PauseChoice> = {}
  const intent = isIn(params.get('intencao'), PAUSE_INTENTS)
  const context = isIn(params.get('contexto'), PAUSE_CONTEXTS)
  if (intent) initial.intent = intent
  if (context) initial.context = context
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-[24px] leading-tight">Modo Pausa</h2>
        <p className="text-muted text-[14px] mt-1">Uma mensagem para ganhar tempo, sem responder no impulso.</p>
      </div>
      <PauseComposer key={`${intent ?? ''}-${context ?? ''}`} initial={initial} />
      <SavedDrafts />
    </div>
  )
}
