/**
 * "me mostra algo que eu salvei pra estudar" — reference content she follows or saved (newsletters,
 * articles, themes). Shown only when she asks, a few at a time, NEVER as a task or "atrasado".
 */
import { ROUTES } from '@/app/routes'
import type { DB, StudyItem } from '@/data/types'
import type { Handler, HandlerInput, LumosReply } from '../types'

const ASK = /\b(salvei|guardei|salvos|salvas|guardados)\b.*\b(estudar|ler|aprender|ver)\b|\bconteudos? salvos?\b|\balgo (?:pra|para) (?:estudar|ler)\b|\bo que (?:eu )?(?:salvei|guardei)\b/

const KIND_EMOJI: Partial<Record<StudyItem['kind'], string>> = { newsletter: '📰', artigo: '📄', video: '🎬', podcast: '🎧', tema: '💡', livro: '📘', curso: '🎓' }

export function savedForLater(db: DB): StudyItem[] {
  return db.studyItems
    .filter((s) => s.status !== 'finalizado' && (s.reference || s.kind === 'newsletter' || ((s.status === 'backlog' || s.status === 'proximo') && ['artigo', 'video', 'podcast', 'tema'].includes(s.kind))))
    .sort((a, b) => a.order - b.order)
}

/** Deterministic little rotation so it doesn't always show the same three. */
function pick<T>(list: T[], seed: string, n: number): T[] {
  if (list.length <= n) return list
  const h = [...seed].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7)
  const start = h % list.length
  return Array.from({ length: n }, (_, i) => list[(start + i) % list.length])
}

function saved(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!ASK.test(n)) return undefined
  const all = savedForLater(db)
  if (!all.length) return { area: 'estudos', text: 'Você ainda não salvou nada pra estudar depois. Quando achar algo bom, me manda que eu guardo.', link: { label: 'Abrir Estudos', to: `${ROUTES.study}?v=salvos` } }
  const shown = pick(all, /\boutr[ao]s\b/.test(n) ? `${now.date}:${now.minutes}` : now.date, 3)
  const track = (s: StudyItem) => db.studyTracks.find((t) => t.id === s.trackId)
  return {
    area: 'estudos',
    text: shown.length === 1 ? 'Uma coisa que você guardou — sem pressa:' : `${shown.length === 2 ? 'Duas' : 'Três'} coisas que você guardou — sem pressa:`,
    lines: shown.map((s) => ({ text: s.title, emoji: KIND_EMOJI[s.kind] ?? '📌', sub: [s.source, track(s)?.name, s.nextContent].filter(Boolean).join(' · ') || undefined })),
    sub: all.length > shown.length ? `Tem mais ${all.length - shown.length} guardadas em Estudos.` : undefined,
    options: all.length > shown.length ? [{ label: 'Me mostra outras', ask: 'me mostra outras coisas que eu salvei pra estudar' }] : undefined,
    link: { label: 'Abrir Estudos', to: `${ROUTES.study}?v=salvos` },
  }
}

export const studyHandler: Handler = { id: 'study', run: saved }
