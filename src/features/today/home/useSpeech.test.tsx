/** Dictation flow with a stand-in for the browser's recognizer: start · live text · send / cancel · refusal. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { END_WATCHDOG_MS, KEYBOARD_DICTATION_HINT, speechSupported, speechUnavailable, useSpeech } from './useSpeech'

type Alt = { transcript: string; confidence?: number }
class FakeRec {
  static last: FakeRec
  lang = ''
  interimResults = false
  continuous = false
  maxAlternatives = 1
  onresult: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error?: string }) => void) | null = null
  constructor() {
    FakeRec.last = this
  }
  start() {}
  stop() {
    this.onend?.()
  }
  abort() {
    this.onend?.()
  }
  say(parts: { alt: Alt; final: boolean }[]) {
    const results = parts.map((p) => Object.assign([p.alt], { isFinal: p.final }))
    this.onresult?.({ resultIndex: 0, results })
  }
}

beforeEach(() => {
  localStorage.clear()
  ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRec
})
afterEach(() => {
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
})

describe('iPhone dictation for Lumos', () => {
  it('start → live words → Enviar delivers the transcript (same text pipeline)', () => {
    const got = vi.fn()
    const { result } = renderHook(() => useSpeech(got))
    expect(result.current.available).toBe(true)
    act(() => result.current.start())
    expect(result.current.listening).toBe(true)
    expect(FakeRec.last.lang).toBe('pt-BR')
    act(() => FakeRec.last.say([{ alt: { transcript: 'amanhã não tenho' }, final: false }]))
    expect(result.current.interim).toBe('amanhã não tenho')
    act(() => FakeRec.last.say([{ alt: { transcript: 'amanhã não tenho inglês', confidence: 0.92 }, final: true }]))
    act(() => result.current.send())
    expect(got).toHaveBeenCalledWith({ text: 'amanhã não tenho inglês', confidence: 0.92 })
    expect(result.current.listening).toBe(false)
  })

  it('Cancelar drops everything', () => {
    const got = vi.fn()
    const { result } = renderHook(() => useSpeech(got))
    act(() => result.current.start())
    act(() => FakeRec.last.say([{ alt: { transcript: 'apaga tudo' }, final: true }]))
    act(() => result.current.cancel())
    expect(got).not.toHaveBeenCalled()
  })

  it('reports low confidence so the composer asks to confirm', () => {
    const got = vi.fn()
    const { result } = renderHook(() => useSpeech(got))
    act(() => result.current.start())
    act(() => FakeRec.last.say([{ alt: { transcript: 'já fiz ioga', confidence: 0.3 }, final: true }]))
    act(() => result.current.send())
    expect(got.mock.calls[0][0].confidence).toBeLessThan(0.6)
  })

  it('when the system refuses dictation here, the mic hides (and stays hidden on this device)', () => {
    const { result } = renderHook(() => useSpeech(vi.fn()))
    act(() => result.current.start())
    act(() => FakeRec.last.onerror?.({ error: 'service-not-allowed' }))
    act(() => FakeRec.last.onend?.())
    expect(result.current.available).toBe(false)
    expect(result.current.error).toMatch(/teclado/)
    expect(speechSupported()).toBe(false)
  })

  it('no recognizer in this browser → no mic at all', () => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    const { result } = renderHook(() => useSpeech(vi.fn()))
    expect(result.current.available).toBe(false)
  })
})

describe('voice audit (iPhone PWA)', () => {
  const setNav = (k: string, v: unknown) => Object.defineProperty(navigator, k, { value: v, configurable: true })
  afterEach(() => {
    setNav('userAgent', 'Mozilla/5.0 (jsdom)')
    setNav('standalone', undefined)
    vi.useRealTimers()
  })

  it('app installed on the iPhone Home Screen → no mic, a keyboard-dictation hint instead (no recognizer opened)', () => {
    setNav('userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148')
    setNav('standalone', true)
    const spy = vi.fn()
    ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = class extends FakeRec {
      constructor() {
        super()
        spy()
      }
    }
    expect(speechUnavailable()).toBe('ios-app')
    const { result } = renderHook(() => useSpeech(vi.fn()))
    expect(result.current.available).toBe(false)
    expect(result.current.fallback).toMatch(/teclado/)
    act(() => result.current.start())
    expect(spy).not.toHaveBeenCalled()
    expect(result.current.listening).toBe(false)
    expect(result.current.error).toBe(KEYBOARD_DICTATION_HINT)
  })

  it('the same iPhone in Safari (not installed) keeps the mic', () => {
    setNav('userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
    expect(speechUnavailable()).toBeUndefined()
  })

  it('permission denied → clear pt-BR message, nothing sent, the strip closes, the mic stays', () => {
    const got = vi.fn()
    const { result } = renderHook(() => useSpeech(got))
    act(() => result.current.start())
    act(() => FakeRec.last.onerror?.({ error: 'not-allowed' }))
    act(() => FakeRec.last.onend?.())
    expect(got).not.toHaveBeenCalled()
    expect(result.current.listening).toBe(false)
    expect(result.current.error).toMatch(/Ajustes › Safari › Microfone/)
    expect(result.current.available).toBe(true)
  })

  it('an error mid-sentence keeps what was heard as partial (to check, never auto-sent)', () => {
    const got = vi.fn()
    const { result } = renderHook(() => useSpeech(got))
    act(() => result.current.start())
    act(() => FakeRec.last.say([{ alt: { transcript: 'marca dentista' }, final: false }]))
    act(() => FakeRec.last.onerror?.({ error: 'network' }))
    act(() => FakeRec.last.onend?.())
    expect(got).toHaveBeenCalledWith({ text: 'marca dentista', confidence: undefined, partial: true })
    expect(result.current.error).toMatch(/teclado/)
  })

  it('going to the background stops the take and keeps the words (partial)', () => {
    const got = vi.fn()
    const { result } = renderHook(() => useSpeech(got))
    act(() => result.current.start())
    act(() => FakeRec.last.say([{ alt: { transcript: 'comprar ração da Luna' }, final: true }]))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    expect(result.current.listening).toBe(false)
    expect(got).toHaveBeenCalledWith(expect.objectContaining({ text: 'comprar ração da Luna', partial: true }))
  })

  it('a recognizer that never reports its end is finished by the watchdog (no stuck "ouvindo…")', () => {
    vi.useFakeTimers()
    class Mute extends FakeRec {
      stop() {}
      abort() {}
    }
    ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = Mute
    const got = vi.fn()
    const { result } = renderHook(() => useSpeech(got))
    act(() => result.current.start())
    act(() => FakeRec.last.say([{ alt: { transcript: 'oi lumos' }, final: true }]))
    act(() => result.current.send())
    expect(result.current.listening).toBe(true)
    act(() => {
      vi.advanceTimersByTime(END_WATCHDOG_MS + 10)
    })
    expect(result.current.listening).toBe(false)
    expect(got).toHaveBeenCalledWith({ text: 'oi lumos', confidence: undefined })
    // A late onend from that take changes nothing.
    act(() => FakeRec.last.onend?.())
    expect(got).toHaveBeenCalledTimes(1)
  })

  it('Enviar with nothing heard → honest message, no fake send', () => {
    const got = vi.fn()
    const { result } = renderHook(() => useSpeech(got))
    act(() => result.current.start())
    act(() => result.current.send())
    expect(got).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/Não ouvi nada/)
  })

  it('leaving the screen mid-take releases the recognizer without sending', () => {
    const got = vi.fn()
    const abort = vi.fn()
    const { result, unmount } = renderHook(() => useSpeech(got))
    act(() => result.current.start())
    const r = FakeRec.last
    r.abort = abort
    act(() => r.say([{ alt: { transcript: 'meio dito' }, final: false }]))
    unmount()
    expect(abort).toHaveBeenCalled()
    expect(got).not.toHaveBeenCalled()
  })

  it('start() that throws (busy microphone) → message, not listening', () => {
    class Busy extends FakeRec {
      start() {
        throw new Error('InvalidStateError')
      }
    }
    ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = Busy
    const { result } = renderHook(() => useSpeech(vi.fn()))
    act(() => result.current.start())
    expect(result.current.listening).toBe(false)
    expect(result.current.error).toMatch(/microfone/)
  })
})
