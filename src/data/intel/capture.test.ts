import { describe, expect, it } from 'vitest'
import { CAPTURE_SUPPORT, capture, normalizeCapture } from './capture'

describe('Universal Capture', () => {
  it('text and voice-with-transcript route to Lumos', () => {
    expect(capture({ kind: 'text', text: '  comi um YoPRO agora ' })).toMatchObject({ text: 'comi um YoPRO agora', supported: true, route: 'lumos', via: 'text' })
    expect(capture({ kind: 'voice', transcript: 'amanhã fiquei presencial' })).toMatchObject({ text: 'amanhã fiquei presencial', route: 'lumos', via: 'voice' })
  })

  it('unsupported kinds are honest; a caption still reaches Lumos', () => {
    const blob = new Blob(['x'])
    const audio = normalizeCapture({ kind: 'voice', audio: blob })
    expect(audio.supported).toBe(false)
    expect(audio.note).toMatch(/não transcrevo/)
    const shot = capture({ kind: 'screenshot', file: blob, name: 'print.png' })
    expect(shot).toMatchObject({ supported: false, route: 'ask_text', attachments: [{ kind: 'screenshot', name: 'print.png' }] })
    expect(capture({ kind: 'image', file: blob, caption: 'cardápio do restaurante' })).toMatchObject({ route: 'lumos', text: 'cardápio do restaurante', supported: false })
    expect(CAPTURE_SUPPORT.file.supported).toBe(false)
  })
})
