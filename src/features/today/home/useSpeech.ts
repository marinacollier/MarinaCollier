/**
 * Voice for Lumos — the iPhone's own dictation (the browser's speech recognition, pt-BR). No audio goes
 * through MARINA OS servers; the transcript is TEXT and enters the same Lumos pipeline as typing.
 *
 *   start()  → asks for the microphone if needed, shows ● 00:08 with the words as they come
 *   send()   → stops and delivers the final transcript (+ confidence when the browser gives one)
 *   cancel() → stops and drops everything
 *
 * Honest availability: no recognition in this browser → `available` is false and the mic is not shown.
 * When the system refuses the service (iPhone app installed on the Home Screen often does), that is
 * remembered on this device and the mic hides there too — no dead button.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

interface RecognitionAlternative {
  transcript: string
  confidence?: number
}
interface RecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<RecognitionAlternative> & { isFinal: boolean }>
}

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionResultEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognitionCtor = new () => Recognition

const OFF_KEY = 'marina-os-dictation-off'

function standalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

function refusedHere(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === (standalone() ? 'app' : 'browser')
  } catch {
    return false
  }
}

function rememberRefused(): void {
  try {
    localStorage.setItem(OFF_KEY, standalone() ? 'app' : 'browser')
  } catch {
    /* private mode: just this session */
  }
}

export function speechSupported(): boolean {
  return !!recognitionCtor() && !refusedHere()
}

/** Below this (when the browser reports one), the transcript is shown to confirm instead of sent. */
export const LOW_CONFIDENCE = 0.6

export interface DictationResult {
  text: string
  /** 0..1, undefined when the browser doesn't say (Safari often doesn't). */
  confidence?: number
}

export type DictationState = 'idle' | 'listening'

export function useSpeech(onResult: (r: DictationResult) => void) {
  const [available, setAvailable] = useState(speechSupported)
  const [state, setState] = useState<DictationState>('idle')
  const [interim, setInterim] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string>()
  const rec = useRef<Recognition | null>(null)
  const parts = useRef<{ text: string; confidence?: number }[]>([])
  const live = useRef('')
  const intent = useRef<'send' | 'cancel' | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const cb = useRef(onResult)
  useEffect(() => {
    cb.current = onResult
  }, [onResult])
  useEffect(
    () => () => {
      clearInterval(timer.current)
      rec.current?.abort()
    },
    [],
  )

  const finish = useCallback(() => {
    clearInterval(timer.current)
    setState('idle')
    setSeconds(0)
    setInterim('')
    const finals = parts.current
    const text = (finals.map((p) => p.text).join(' ').trim() || live.current).trim()
    const confs = finals.map((p) => p.confidence).filter((c): c is number => typeof c === 'number' && c > 0)
    const confidence = confs.length ? confs.reduce((s, c) => s + c, 0) / confs.length : undefined
    const go = intent.current === 'send'
    parts.current = []
    live.current = ''
    intent.current = undefined
    rec.current = null
    if (go && text) cb.current({ text, confidence })
    else if (go) setError('Não ouvi nada — tenta de novo, mais perto do microfone?')
  }, [])

  const start = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor || rec.current) return
    setError(undefined)
    parts.current = []
    live.current = ''
    // Ends by itself after a pause: what was said is sent (her tap on Enviar is not required).
    intent.current = 'send'
    const r = new Ctor()
    r.lang = 'pt-BR'
    r.interimResults = true
    r.continuous = true
    r.maxAlternatives = 1
    r.onresult = (e) => {
      const finals: { text: string; confidence?: number }[] = []
      let pending = ''
      for (let i = 0; i < e.results.length; i++) {
        const alt = e.results[i][0]
        if (!alt) continue
        if (e.results[i].isFinal) finals.push({ text: alt.transcript.trim(), confidence: alt.confidence })
        else pending += alt.transcript
      }
      parts.current = finals
      live.current = [...finals.map((f) => f.text), pending.trim()].filter(Boolean).join(' ')
      setInterim(live.current)
    }
    r.onerror = (e) => {
      if (e.error === 'service-not-allowed') {
        // The system refuses dictation here (e.g. the app installed on the Home Screen): hide the mic.
        rememberRefused()
        setAvailable(false)
        setError('Neste modo o iPhone não libera o ditado para o app — use o 🎙 do teclado, que a Lumos entende igual.')
      } else if (e.error === 'not-allowed') setError('Sem acesso ao microfone — libere em Ajustes › Safari › Microfone e tente de novo.')
      else if (e.error === 'no-speech') setError('Não ouvi nada — tenta de novo, mais perto do microfone?')
      else if (e.error !== 'aborted') setError('Não consegui ouvir agora. Tenta de novo?')
      intent.current = 'cancel'
    }
    r.onend = finish
    rec.current = r
    try {
      r.start()
      setState('listening')
      setSeconds(0)
      const t0 = Date.now()
      timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - t0) / 1000)), 250)
    } catch {
      rec.current = null
      setState('idle')
      setError('Não consegui abrir o microfone agora.')
    }
  }, [finish])

  /** Stop listening and deliver what was said. */
  const send = useCallback(() => {
    if (!rec.current) return
    intent.current = 'send'
    rec.current.stop()
  }, [])

  /** Stop and drop everything. */
  const cancel = useCallback(() => {
    if (!rec.current) return
    intent.current = 'cancel'
    rec.current.abort()
  }, [])

  return { available, supported: available, listening: state === 'listening', state, interim, seconds, error, start, send, stop: send, cancel, clearError: () => setError(undefined) }
}

export function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
