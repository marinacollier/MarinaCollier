/**
 * Reads a print / photo / PDF through the `lumos-read` function (Claude, server-side key) and turns the
 * answer into an AttachmentReading. Policy:
 *  - the file is downscaled on the phone and sent once; it is NOT stored (not in IndexedDB, not in backups,
 *    not on the server). Only what Lumos writes stays (an event, a task…), with the file NAME as a reference.
 *  - no field is filled in here that the reader didn't return; a missing month stays missing.
 */
import type { DraftField, EventDraft } from '@/data/calendar/events'
import { BackendError, callBackend, isBackendConfigured } from '@/integrations/backend'
import { authAvailable } from '@/integrations/auth'
import type { AttachmentCategory, AttachmentReading } from './types'

const IMAGE_OK = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_SIDE = 1600
const MAX_PDF_BYTES = 10 * 1024 * 1024

/** The attach button only appears where reading can actually happen (no dead control). */
export function canReadAttachments(): boolean {
  return isBackendConfigured() && authAvailable()
}

export class ReadError extends Error {
  constructor(
    readonly code: 'signin' | 'too_big' | 'type' | 'failed' | 'offline',
    message: string,
  ) {
    super(message)
  }
}

function toBase64(buf: ArrayBuffer): string {
  let s = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Images: re-encoded as JPEG ≤1600px (also turns HEIC from the camera into something readable). */
export async function prepareFile(file: File): Promise<{ mediaType: string; data: string; kind: AttachmentReading['kind'] }> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF_BYTES) throw new ReadError('too_big', 'PDF grande demais (máx. 10 MB).')
    return { mediaType: 'application/pdf', data: toBase64(await file.arrayBuffer()), kind: 'pdf' }
  }
  if (!file.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name)) throw new ReadError('type', 'Leio imagens (print, foto) e PDF.')
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (blob) return { mediaType: 'image/jpeg', data: toBase64(await blob.arrayBuffer()), kind: 'image' }
  } catch {
    /* fall through: send as is when the type is already supported */
  }
  if (!IMAGE_OK.includes(file.type)) throw new ReadError('type', 'Não consegui abrir essa imagem — tenta um print (PNG/JPEG).')
  if (file.size > MAX_PDF_BYTES) throw new ReadError('too_big', 'Imagem grande demais.')
  return { mediaType: file.type, data: toBase64(await file.arrayBuffer()), kind: 'image' }
}

/** The function's JSON (all keys present, null where absent). */
export interface RawReading {
  category: AttachmentCategory
  summary: string
  confidence: 'high' | 'medium' | 'low'
  event: { title: string; date: string | null; dayOfMonth: number | null; startTime: string | null; endTime: string | null; location: string | null; description: string | null } | null
  task: { title: string; due: string | null; who: string | null } | null
  book: { title: string; author: string | null } | null
  items: string[]
  text: string
}

const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
const isTime = (s: string | null | undefined): s is string => !!s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

/** Strict conversion: malformed values are dropped (and become "missing"), never repaired by guessing. */
export function toReading(raw: RawReading, name: string, kind: AttachmentReading['kind']): AttachmentReading {
  let event: EventDraft | undefined
  if (raw.event) {
    const e = raw.event
    const missing: DraftField[] = []
    const date = isDate(e.date) ? e.date : undefined
    if (!e.title?.trim()) missing.push('title')
    if (!date && e.dayOfMonth) missing.push('month')
    else if (!date) missing.push('date')
    if (!isTime(e.startTime)) missing.push('time')
    event = {
      title: e.title?.trim() || undefined,
      date,
      dayOfMonth: !date && e.dayOfMonth ? e.dayOfMonth : undefined,
      startTime: isTime(e.startTime) ? e.startTime : undefined,
      endTime: isTime(e.startTime) && isTime(e.endTime) ? e.endTime : undefined,
      location: e.location?.trim() || undefined,
      description: e.description?.trim() || undefined,
      missing,
      confidence: raw.confidence,
      sourceAttachment: { name, kind },
    }
  }
  return {
    name,
    kind,
    category: raw.category,
    summary: raw.summary || undefined,
    text: raw.text || undefined,
    confidence: raw.confidence,
    event,
    task: raw.task ? { title: raw.task.title, due: isDate(raw.task.due) ? raw.task.due : undefined, who: raw.task.who ?? undefined } : undefined,
    book: raw.book ? { title: raw.book.title, author: raw.book.author ?? undefined } : undefined,
    items: raw.items?.length ? raw.items : undefined,
  }
}

export async function readAttachment(file: File, today: string, caption?: string): Promise<AttachmentReading> {
  const prepared = await prepareFile(file)
  try {
    const { reading } = await callBackend<{ reading: RawReading }>('lumos-read', {
      method: 'POST',
      body: { name: file.name, mediaType: prepared.mediaType, data: prepared.data, today, caption: caption || undefined },
    })
    return toReading(reading, file.name || (prepared.kind === 'pdf' ? 'arquivo.pdf' : 'print'), prepared.kind)
  } catch (err) {
    if (err instanceof BackendError) {
      if (err.code === 'unauthorized' || err.code === 'needs_auth') throw new ReadError('signin', 'Pra eu ler prints, entra na sua conta do MARINA OS.')
      if (err.code === 'network') throw new ReadError('offline', 'Sem internet agora — leio o print quando a conexão voltar.')
      if (err.code === 'policy_blocked') throw new ReadError('failed', err.message)
      throw new ReadError('failed', err.message || 'Não consegui ler esse arquivo agora.')
    }
    throw err
  }
}
