/**
 * Voice for Lumos — the browser's speech recognition (pt-BR). No audio goes through MARINA OS servers
 * and nothing is recorded to a file: the transcript is TEXT and enters the same Lumos pipeline as typing.
 *
 *   start()  → asks for the microphone if needed, shows ● 00:08 with the words as they come
 *   send()   → stops and delivers the final transcript (+ confidence when the browser gives one)
 *   cancel() → stops and drops everything
 *
 * Honest availability (no dead mic button):
 *   - no recognizer in this browser → `available` false;
 *   - the app installed on the iPhone Home Screen (standalone PWA): WebKit refuses recognition there
 *     ("service-not-allowed"), so the mic is never offered — `fallback` tells her to use the 🎙 of the
 *     iOS keyboard, which works everywhere and lands as typed text;
 *   - the system refused it once on this device → remembered, the mic hides there too.
 *
 * Never loses what she said: an interrupted take (app went to background, error mid-sentence, the
 * recognizer stopping on its own with an error) is handed back as `partial` — the composer puts it in
 * the field to check — never auto-sent and never dropped. A recognizer that doesn't report its end is
 * finished by a watchdog, so the strip never stays stuck on "ouvindo…".
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
/** After stop/abort, a recognizer that never fires `onend` is finished by hand. */
export const END_WATCHDOG_MS = 1500
/** A take never runs forever (a forgotten open mic): it stops and delivers what was said. */
export const MAX_TAKE_MS = 90_000

export const KEYBOARD_DICTATION_HINT = 'Para falar, toque no campo e use o 🎙 do teclado do iPhone — a Lumos entende igual.'

function standalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1)
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

export type SpeechUnavailable = 'no-api' | 'ios-app' | 'refused'

/** Why the mic is not offered here (undefined = it can be). */
export function speechUnavailable(): SpeechUnavailable | undefined {
  if (!recognitionCtor()) return 'no-api'
  if (isIOS() && standalone()) return 'ios-app'
  if (refusedHere()) return 'refused'
  return undefined
}

export function speechSupported(): boolean {
  return !speechUnavailable()
}

/** Below this (when the browser reports one), the transcript is shown to confirm instead of sent. */
export const LOW_CONFIDENCE = 0.6

export interface DictationResult {
  text: string
  /** 0..1, undefined when the browser doesn't say (Safari often doesn't). */
  confidence?: number
  /** The take was interrupted: show it in the field to check — never send it by itself. */
  partial?: boolean
}

export type DictationState = 'idle' | 'listening'

type Intent = 'send' | 'cancel' | 'keep'

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'Sem acesso ao microfone — libere em Ajustes › Safari › Microfone (ou use o 🎙 do teclado).',
  'audio-capture': 'O microfone está ocupado (ligação ou outro app?). Tenta de novo daqui a pouco — ou usa o 🎙 do teclado.',
  network: 'O ditado do navegador precisa de internet agora. Usa o 🎙 do teclado, que funciona igual.',
  'no-speech': 'Não ouvi nada — tenta de novo, mais perto do microfone?',
  'language-not-supported': 'O ditado em português não está disponível aqui — usa o 🎙 do teclado.',
}

export function useSpeech(onResult: (r: DictationResult) => void) {
  const [unavailable, setUnavailable] = useState<SpeechUnavailable | undefined>(speechUnavailable)
  const [state, setState] = useState<DictationState>('idle')
  const [interim, setInterim] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string>()
  const rec = useRef<Recognition | null>(null)
  const parts = useRef<{ text: string; confidence?: number }[]>([])
  const live = useRef('')
  const intent = useRef<Intent | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const watchdog = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cap = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cb = useRef(onResult)
  useEffect(() => {
    cb.current = onResult
  }, [onResult])

  const clearTimers = () => {
    clearInterval(timer.current)
    clearTimeout(watchdog.current)
    clearTimeout(cap.current)
  }

  const finish = useCallback((r: Recognition) => {
    // A late `onend` from an older take (or after the watchdog already finished it) is ignored.
    if (rec.current !== r) return
    clearTimers()
    r.onresult = null
    r.onerror = null
    r.onend = null
    rec.current = null
    setState('idle')
    setSeconds(0)
    setInterim('')
    const finals = parts.current
    const text = (finals.map((p) => p.text).join(' ').trim() || live.current).trim()
    const confs = finals.map((p) => p.confidence).filter((c): c is number => typeof c === 'number' && c > 0)
    const confidence = confs.length ? confs.reduce((s, c) => s + c, 0) / confs.length : undefined
    const why = intent.current
    parts.current = []
    live.current = ''
    intent.current = undefined
    if (why === 'cancel') return
    if (why === 'keep') {
      if (text) cb.current({ text, confidence, partial: true })
      return
    }
    if (text) cb.current({ text, confidence })
    else setError('Não ouvi nada — tenta de novo, mais perto do microfone?')
  }, [])

  /** Stop the current take with an intent; finish by hand if the recognizer never reports its end. */
  const end = useCallback(
    (why: Intent, how: 'stop' | 'abort') => {
      const r = rec.current
      if (!r) return
      intent.current = why
      clearTimeout(watchdog.current)
      watchdog.current = setTimeout(() => finish(r), END_WATCHDOG_MS)
      try {
        if (how === 'stop') r.stop()
        else r.abort()
      } catch {
        finish(r)
      }
    },
    [finish],
  )

  // Leaving the app (Home button, lock, another app) interrupts the take: keep the words, don't send.
  useEffect(() => {
    if (state !== 'listening') return
    const onHide = () => {
      if (document.visibilityState === 'hidden') end('keep', 'stop')
    }
    const onPageHide = () => end('keep', 'stop')
    document.addEventListener('visibilitychange', onHide)
    // Not window 'blur': iOS blurs the page for its own microphone prompt, which would end the first take.
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [state, end])

  // Unmount: release the microphone, no callback into a screen that is gone.
  useEffect(
    () => () => {
      clearTimers()
      const r = rec.current
      rec.current = null
      if (!r) return
      r.onresult = null
      r.onerror = null
      r.onend = null
      try {
        r.abort()
      } catch {
        /* already stopped */
      }
    },
    [],
  )

  const start = useCallback(() => {
    if (rec.current) return
    const why = speechUnavailable()
    if (why) {
      setUnavailable(why)
      setError(KEYBOARD_DICTATION_HINT)
      return
    }
    const Ctor = recognitionCtor()!
    setError(undefined)
    parts.current = []
    live.current = ''
    // Ends by itself after a pause: what was said is sent (her tap on Enviar is not required).
    intent.current = 'send'
    let r: Recognition
    try {
      r = new Ctor()
    } catch {
      setError(`Não consegui abrir o ditado agora. ${KEYBOARD_DICTATION_HINT}`)
      return
    }
    r.lang = 'pt-BR'
    r.interimResults = true
    r.continuous = true
    r.maxAlternatives = 1
    r.onresult = (e) => {
      if (rec.current !== r) return
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
      if (rec.current !== r) return
      const code = e.error ?? ''
      if (code === 'aborted') return
      if (code === 'service-not-allowed') {
        // The system refuses dictation here (e.g. the app installed on the Home Screen): hide the mic.
        rememberRefused()
        setUnavailable('refused')
        setError(`Neste modo o iPhone não libera o ditado para o app. ${KEYBOARD_DICTATION_HINT}`)
      } else setError(ERROR_TEXT[code] ?? 'Não consegui ouvir agora. Tenta de novo?')
      // Whatever was already understood goes to the field to check — never lost, never auto-sent.
      intent.current = 'keep'
    }
    r.onend = () => finish(r)
    rec.current = r
    try {
      r.start()
    } catch {
      rec.current = null
      r.onresult = null
      r.onerror = null
      r.onend = null
      setState('idle')
      setError(`Não consegui abrir o microfone agora. ${KEYBOARD_DICTATION_HINT}`)
      return
    }
    setState('listening')
    setSeconds(0)
    const t0 = Date.now()
    timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - t0) / 1000)), 250)
    cap.current = setTimeout(() => end('send', 'stop'), MAX_TAKE_MS)
  }, [finish, end])

  /** Stop listening and deliver what was said. */
  const send = useCallback(() => end('send', 'stop'), [end])

  /** Stop and drop everything. */
  const cancel = useCallback(() => end('cancel', 'abort'), [end])

  const available = !unavailable
  return {
    available,
    supported: available,
    /** Why the mic isn't offered (show `fallback` and point to the keyboard's 🎙 instead). */
    unavailable,
    fallback: unavailable ? KEYBOARD_DICTATION_HINT : undefined,
    listening: state === 'listening',
    state,
    interim,
    seconds,
    error,
    start,
    send,
    stop: send,
    cancel,
    clearError: () => setError(undefined),
  }
}

export function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
