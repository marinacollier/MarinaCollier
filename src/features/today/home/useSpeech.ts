/**
 * Voice input for the Lumos composer — the browser's own speech recognition (Safari/Chrome),
 * pt-BR, no audio leaves through us. When the browser has none, `supported` is false and the
 * mic button is simply not shown (no fake button).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

interface RecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: RecognitionResultEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function speechSupported(): boolean {
  return !!recognitionCtor()
}

/** `onText` receives the whole transcript so far (interim included) — the composer shows it live. */
export function useSpeech(onText: (text: string, final: boolean) => void) {
  const [supported] = useState(speechSupported)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string>()
  const rec = useRef<Recognition | null>(null)
  const cb = useRef(onText)
  useEffect(() => {
    cb.current = onText
  }, [onText])

  useEffect(() => () => rec.current?.abort(), [])

  const start = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    setError(undefined)
    const r = new Ctor()
    r.lang = 'pt-BR'
    r.interimResults = true
    r.continuous = false
    r.onresult = (e) => {
      let text = ''
      let final = false
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0]?.transcript ?? ''
        final = e.results[i].isFinal
      }
      cb.current(text.trim(), final)
    }
    r.onerror = (e) => {
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Sem acesso ao microfone — dá pra liberar nos ajustes do navegador.' : 'Não consegui ouvir agora. Tenta de novo?')
      setListening(false)
    }
    r.onend = () => setListening(false)
    rec.current = r
    try {
      r.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [])

  const stop = useCallback(() => rec.current?.stop(), [])

  return { supported, listening, error, start, stop }
}
