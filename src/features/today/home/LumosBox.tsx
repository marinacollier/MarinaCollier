/**
 * LUMOS on Home — the main element. "fala comigo" with a contextual placeholder, voice when the
 * browser can transcribe, attachments routed through Universal Capture (honest when unsupported),
 * and at most three context suggestions from the intelligence layer (nothing generic).
 */
import { useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Mic, Paperclip, X } from 'lucide-react'
import { normalizeCapture } from '@/data/intel'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { LOW_CONFIDENCE, useSpeech } from './useSpeech'
import { VoiceBar } from '@/features/assistant/VoiceBar'

export function LumosBox({ placeholder, suggestions, onAsk }: { placeholder: string; suggestions: string[]; onAsk: (text: string) => void }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState<string>()
  const fileRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  // The transcript goes to Lumos like typed text. When the browser says it's unsure, she confirms first.
  const speech = useSpeech(({ text: said, confidence }) => {
    const q = normalizeCapture({ kind: 'voice', transcript: said }).text?.trim()
    if (!q) return
    if (confidence !== undefined && confidence < LOW_CONFIDENCE) {
      setText(q)
      setNote(`Entendi: “${q}” — confere e envia (ou corrige antes).`)
      areaRef.current?.focus()
      return
    }
    haptic('light')
    onAsk(q)
  })

  const send = (e?: FormEvent) => {
    e?.preventDefault()
    const n = normalizeCapture({ kind: 'text', text })
    const q = n.text?.trim()
    if (!q) return areaRef.current?.focus()
    haptic('light')
    if (speech.listening) speech.cancel()
    setText('')
    setNote(undefined)
    onAsk(q)
  }

  const onFile = (file?: File) => {
    if (!file) return
    const kind = file.type.startsWith('image/') ? 'image' : 'file'
    const n = normalizeCapture({ kind, file, name: file.name, caption: text.trim() || undefined })
    if (n.supported && n.text) onAsk(n.text)
    else setNote(`${file.name} — ${n.note ?? 'Ainda não leio esse tipo de arquivo.'}`)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <section aria-label="Lumos">
      <form onSubmit={send} className="relative rounded-[28px] bg-surface border border-line/80 shadow-[0_18px_40px_-28px_rgb(29_34_27/0.45)] px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] font-semibold text-plum">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-plum" />
          Lumos

        </div>
        <textarea
          ref={areaRef}
          value={text}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) send(e)
          }}
          enterKeyHint="send"
          aria-label="Fala com a Lumos"
          placeholder={`fala comigo… ${placeholder}`}
          className="mt-2 w-full resize-none bg-transparent font-display text-[21px] leading-[1.3] tracking-tight text-ink placeholder:text-muted/70 outline-none min-h-[56px] max-h-40"
        />
        {speech.listening ? (
          <div className="-mx-1 mt-1">
            <VoiceBar seconds={speech.seconds} interim={speech.interim} onCancel={speech.cancel} onSend={speech.send} />
          </div>
        ) : (
          <div className="flex items-center justify-between -mx-2 mt-1">
            <div className="flex items-center">
              <button type="button" aria-label="Anexar foto ou arquivo" onClick={() => fileRef.current?.click()} className="h-11 w-11 rounded-full inline-flex items-center justify-center text-muted active:bg-surface-2 transition">
                <Paperclip size={19} />
              </button>
              {speech.available && (
                <button type="button" aria-label="Falar com a Lumos" onClick={() => speech.start()} className="h-11 w-11 rounded-full inline-flex items-center justify-center transition text-muted active:bg-surface-2">
                  <Mic size={19} />
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
            <button
              type="submit"
              aria-label="Enviar para a Lumos"
              className={cn('h-11 w-11 rounded-full inline-flex items-center justify-center transition active:scale-95', text.trim() ? 'bg-ink text-bg' : 'bg-surface-2 text-muted')}
            >
              <ArrowUp size={19} />
            </button>
          </div>
        )}
      </form>

      <AnimatePresence initial={false}>
        {(note || speech.error) && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <span className="flex items-start gap-2 text-[13px] text-ink-2 leading-snug px-2 pt-2.5">
              <span className="flex-1">{note ?? speech.error}</span>
              {note && (
                <button type="button" aria-label="Fechar aviso" onClick={() => setNote(undefined)} className="-mt-2.5 -mr-1 h-9 w-9 inline-flex items-center justify-center text-muted">
                  <X size={15} />
                </button>
              )}
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {suggestions.slice(0, 3).map((s, i) => (
            <motion.button
              key={s}
              type="button"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              onClick={() => {
                haptic('light')
                onAsk(s)
              }}
              className="min-h-10 px-3.5 rounded-full bg-surface-2 text-[13.5px] text-ink-2 active:scale-[0.97] transition"
            >
              {s}
            </motion.button>
          ))}
        </div>
      )}
    </section>
  )
}
