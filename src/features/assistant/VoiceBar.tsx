/**
 * The recording strip shared by every Lumos composer: ● 00:08 · what she is saying · Cancelar · Enviar.
 * Inline, no full screen. The transcript is handed to the composer's own send (same pipeline as typing).
 */
import { motion } from 'framer-motion'
import { ArrowUp, X } from 'lucide-react'
import { clock } from '@/features/today/home/useSpeech'

export function VoiceBar({ seconds, interim, onCancel, onSend }: { seconds: number; interim: string; onCancel: () => void; onSend: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} role="status" aria-live="polite" className="flex items-center gap-2 min-h-11">
      <span className="inline-flex items-center gap-1.5 shrink-0 font-sport text-[16px] tabular-nums text-accent">
        <motion.span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
        {clock(seconds)}
        <span className="sr-only">gravando</span>
      </span>
      <span className="flex-1 min-w-0 text-[14px] text-ink-2 truncate">{interim || 'ouvindo…'}</span>
      <button type="button" onClick={onCancel} aria-label="Cancelar gravação" className="h-11 px-2.5 inline-flex items-center gap-1 rounded-full text-[13.5px] text-muted active:bg-surface-2">
        <X size={15} /> Cancelar
      </button>
      <button type="button" onClick={onSend} aria-label="Parar e enviar" className="h-11 pl-3 pr-3.5 inline-flex items-center gap-1.5 rounded-full bg-ink text-bg text-[13.5px] font-medium active:scale-95 transition">
        <ArrowUp size={15} /> Enviar
      </button>
    </motion.div>
  )
}
