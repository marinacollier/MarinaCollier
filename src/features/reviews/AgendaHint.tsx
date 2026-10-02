import { ChevronRight } from 'lucide-react'
import { openSheet } from '@/app/ui-store'

/** "📋 Weekly CEO Review · sáb 09:00 — abrir pauta" → opens the event (and its template) in the event sheet. */
export function AgendaHint({ emoji, title, when, eventId }: { emoji: string; title: string; when: string; eventId: string }) {
  return (
    <button
      type="button"
      onClick={() => openSheet('event', { id: eventId })}
      className="card w-full mt-3 flex items-center gap-3 px-4 py-3 min-h-[56px] text-left active:scale-[0.99] transition"
    >
      <span className="h-10 w-10 rounded-xl bg-plum-soft flex items-center justify-center text-[18px] shrink-0" aria-hidden>
        {emoji}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-snug">{title}</span>
        <span className="block text-[13px] text-muted">
          {when} · <span className="text-accent font-medium">abrir pauta</span>
        </span>
      </span>
      <ChevronRight size={18} className="text-muted/60 shrink-0" />
    </button>
  )
}
