/**
 * ChangeFeed — "o que mudou?" with REAL deltas since a moment (default: profile.lumosLastSeenAt).
 * Sources: the life log (Lumos / integration / important manual changes, with provenance) and the
 * createdAt/updatedAt of key collections (her own edits in the screens). Untouched seed records,
 * sync bookkeeping and low-value churn (occurrences, overrides already logged, check-ins) are ignored.
 */
import type { DB, ISODateTime, LifeEvent } from '../types'
import { actions } from '../store'
import { SEED_IDS } from '../seed/ids'
import { addDays, toInstant } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { capitalize, dayLabel } from './context'
import type { ChangeItem, Now } from './types'

/** Start of yesterday (São Paulo) — the baseline for "o que mudou desde ontem?". */
export function sinceYesterday(now: Now): ISODateTime {
  return toInstant(addDays(now.date, -1)).toISOString()
}

/** Seconds of tolerance: records touched right after being created (seed, import) are not "changes". */
const SAME_MOMENT_MS = 5_000

const touched = (r: { createdAt: string; updatedAt: string }) => Date.parse(r.updatedAt) - Date.parse(r.createdAt) > SAME_MOMENT_MS
const SEED_ID_SET = new Set<string>(Object.values(SEED_IDS))
const isSeed = (id: string) => id.startsWith('seed:') || SEED_ID_SET.has(id)

interface Candidate extends ChangeItem {
  group: string
}

function entityChanges(db: DB, since: ISODateTime, now: Now, logged: Set<string>): Candidate[] {
  const out: Candidate[] = []
  const after = (iso?: string) => !!iso && iso > since
  const created = (r: { id: string; createdAt: string }) => after(r.createdAt) && !isSeed(r.id)
  const by = (r: object) => ('external' in r && r.external ? ('integration' as const) : ('marina' as const))
  const prov = (r: object) => ('external' in r && r.external ? ('integration' as const) : ('user' as const))
  const push = (c: Candidate) => {
    if (c.ref && logged.has(`${c.ref.type}:${c.ref.id}`)) return
    out.push(c)
  }

  for (const t of db.tasks) {
    if (t.status === 'done' && after(t.completedAt)) push({ at: t.completedAt!, title: `${t.title} — feito`, by: 'marina', provenance: 'user', ref: { type: 'task', id: t.id }, group: 'tarefa feita' })
    else if (created(t)) push({ at: t.createdAt, title: t.status === 'waiting' ? `Esperando ${t.waiting?.who ?? 'alguém'}: ${t.title}` : `Nova tarefa: ${t.title}`, by: by(t), provenance: prov(t), ref: { type: 'task', id: t.id }, group: 'tarefa nova' })
  }
  for (const e of db.events) {
    if (created(e)) push({ at: e.createdAt, title: `Na agenda: ${e.title} (${dayLabel(e.date, now.date)})`, by: by(e), provenance: prov(e), ref: { type: 'event', id: e.id }, group: 'agenda' })
    else if (after(e.updatedAt) && touched(e) && !e.external) push({ at: e.updatedAt, title: `${e.title} mudou`, by: 'marina', provenance: 'user', ref: { type: 'event', id: e.id }, group: 'agenda' })
  }
  for (const w of db.workouts) {
    if ((w.status === 'feito' || w.status === 'adaptado') && after(w.updatedAt) && (touched(w) || !isSeed(w.id)))
      push({ at: w.updatedAt, title: `Treino feito: ${w.title ?? w.modality}`, by: by(w), provenance: prov(w), ref: { type: 'workout', id: w.id }, group: 'treino feito' })
  }
  for (const b of db.books) {
    if (!after(b.updatedAt) || (!touched(b) && isSeed(b.id))) continue
    const title = b.status === 'finalizado' ? `Terminou ${b.title}` : b.status === 'lendo' ? `Lendo ${b.title}` : created(b) ? `Livro na lista: ${b.title}` : `${b.title} atualizado`
    push({ at: b.updatedAt, title, by: 'marina', provenance: 'user', ref: { type: 'book', id: b.id }, group: 'livro' })
  }
  for (const i of db.tripItems) {
    if (!after(i.updatedAt) || (!touched(i) && isSeed(i.id))) continue
    if (i.status === 'confirmado' || i.status === 'feito') push({ at: i.updatedAt, title: `${i.title} — ${i.status === 'feito' ? 'feito' : 'confirmado'}`, by: 'marina', provenance: 'user', ref: { type: 'tripItem', id: i.id }, group: 'viagem' })
    else if (created(i)) push({ at: i.createdAt, title: `Viagem: ${i.title}`, by: 'marina', provenance: 'user', ref: { type: 'tripItem', id: i.id }, group: 'viagem' })
  }
  for (const x of db.expenses) {
    if (created(x)) push({ at: x.createdAt, title: `Gasto: ${x.title}`, by: by(x), provenance: prov(x), ref: { type: 'expense', id: x.id }, group: 'gasto' })
  }
  for (const n of db.workInbox) {
    if (created(n)) push({ at: n.createdAt, title: `Trabalho: ${n.subject}`, by: by(n), provenance: prov(n), ref: { type: 'workInbox', id: n.id }, group: 'trabalho' })
  }
  for (const p of db.pantry ?? []) {
    if (created(p)) push({ at: p.createdAt, title: p.kind === 'preparado' ? `Pronto em casa: ${p.name}` : `Em casa: ${p.name}`, by: 'marina', provenance: 'user', group: 'casa' })
  }
  return out
}

const GROUP_WORDS: Record<string, [string, string]> = {
  'tarefa nova': ['tarefa nova', 'tarefas novas'],
  'tarefa feita': ['tarefa feita', 'tarefas feitas'],
  agenda: ['mudança na agenda', 'mudanças na agenda'],
  'treino feito': ['treino feito', 'treinos feitos'],
  livro: ['novidade nos livros', 'novidades nos livros'],
  viagem: ['novidade da viagem', 'novidades da viagem'],
  gasto: ['gasto registrado', 'gastos registrados'],
  trabalho: ['coisa nova do trabalho', 'coisas novas do trabalho'],
  casa: ['item em casa', 'itens em casa'],
}

const lowerFirst = (s: string) => (s && !/^[A-Z]{2}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)

function joinPt(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
}

/** Real deltas since `since` (default: profile.lumosLastSeenAt), newest first, + one natural line. */
export function changeFeed(db: DB, now: Now, since?: ISODateTime): { since?: ISODateTime; items: ChangeItem[]; summary: string } {
  const base = since ?? db.profile.lumosLastSeenAt
  const until = now.iso ?? nowISO()
  if (!base) return { since: undefined, items: [], summary: 'Ainda não tenho um "desde a última vez" — a partir de agora eu acompanho.' }

  const events = (db.lifeLog ?? []).filter((e) => e.at > base && e.at <= until && !e.causedBy && !(e.kind === 'learned' && e.confidence === 'low'))
  const logged = new Set((db.lifeLog ?? []).filter((e) => e.at > base && e.ref).map((e) => `${e.ref!.type}:${e.ref!.id}`))
  const fromLog: Candidate[] = events.map((e: LifeEvent) => ({ at: e.at, title: e.title, by: e.by, provenance: e.provenance, ref: e.ref, group: '' }))
  const fromEntities = entityChanges(db, base, now, logged).filter((c) => c.at <= until)

  const items = [...fromLog, ...fromEntities].sort((a, b) => b.at.localeCompare(a.at))
  if (!items.length) return { since: base, items: [], summary: 'Nada mudou desde a última vez. Tudo como você deixou.' }

  // Summary: the logged changes by name (max 3), the rest counted by group.
  const named = fromLog.slice(0, 3).map((c) => lowerFirst(c.title.replace(/\.$/, '')))
  const counts = new Map<string, number>()
  for (const c of [...fromLog.slice(3), ...fromEntities]) counts.set(c.group || 'outro', (counts.get(c.group || 'outro') ?? 0) + 1)
  const counted = [...counts.entries()].map(([g, n]) => {
    const w = GROUP_WORDS[g] ?? ['mudança', 'mudanças']
    return `${n} ${n === 1 ? w[0] : w[1]}`
  })
  const summary = `${capitalize(joinPt([...named, ...counted]))}.`
  return { since: base, items: items.map(({ group: _g, ...c }) => c), summary }
}

/** Marina just talked to Lumos / opened Home: the next "o que mudou?" starts from here. */
export function markLumosSeen(now?: Now): void {
  actions.setProfile({ lumosLastSeenAt: now?.iso ?? nowISO() })
}
