/**
 * "Fala com a Lumos" — a small composer the Home (or any screen) can drop in. It hands the sentence
 * to the Lumos page via ?q=, where it is understood, previewed and confirmed. No state of its own.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, Sparkles } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { cn } from '@/lib/cn'

const HINTS = ['amanhã cancelei meu inglês', 'comi um YoPRO', 'acordei agora', 'quero acordar 5h30 amanhã']

export function LumosComposer({ className, placeholder }: { className?: string; placeholder?: string }) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [hint] = useState(() => HINTS[new Date().getMinutes() % HINTS.length])
  const send = () => {
    const q = text.trim()
    if (!q) return navigate(ROUTES.assistant)
    navigate(`${ROUTES.assistant}?q=${encodeURIComponent(q)}`)
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
      className={cn('relative', className)}
    >
      <Sparkles size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-plum pointer-events-none" aria-hidden />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        enterKeyHint="send"
        autoComplete="off"
        aria-label="Fale com a Lumos"
        placeholder={placeholder ?? `Fala com a Lumos — “${hint}”`}
        className="input h-12 pl-10 pr-12 rounded-full bg-surface border-line placeholder:text-[13.5px]"
      />
      <button
        type="submit"
        aria-label="Enviar para a Lumos"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-ink text-bg flex items-center justify-center transition active:scale-95"
      >
        <ArrowUp size={18} />
      </button>
    </form>
  )
}
