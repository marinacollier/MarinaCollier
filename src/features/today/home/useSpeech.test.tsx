/** Dictation flow with a stand-in for the browser's recognizer: start · live text · send / cancel · refusal. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { speechSupported, useSpeech } from './useSpeech'

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
