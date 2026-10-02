import { toDateKey } from '@/lib/date'
/**
 * CSV export. Pure. Comma separated, CRLF lines, UTF-8 BOM so Excel opens accents correctly.
 */
import type { DB } from '@/data/types'
import { modalityOf } from '@/data/selectors'
import { formatFullDate } from '@/lib/date'

export const BOM = '﻿'

export type Cell = string | number | boolean | null | undefined

export function escapeCell(v: Cell): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v)
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(headers: string[], rows: Cell[][], { bom = true } = {}): string {
  const lines = [headers, ...rows].map((r) => r.map(escapeCell).join(','))
  return (bom ? BOM : '') + lines.join('\r\n') + '\r\n'
}

const date = (k?: string) => (k ? formatFullDate(k) : '')
/** "1234,56" (decimal comma, no thousands separator — friendly to BR spreadsheets). */
const money = (c?: number) => (c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','))

export type CsvDatasetId = 'gastos' | 'tarefas' | 'treinos' | 'livros' | 'estudos' | 'wins'

export const CSV_DATASETS: { id: CsvDatasetId; label: string; emoji: string }[] = [
  { id: 'gastos', label: 'Gastos', emoji: '💸' },
  { id: 'tarefas', label: 'Tarefas', emoji: '✓' },
  { id: 'treinos', label: 'Treinos', emoji: '🏃‍♀️' },
  { id: 'livros', label: 'Livros', emoji: '📖' },
  { id: 'estudos', label: 'Estudos', emoji: '📚' },
  { id: 'wins', label: 'Wins', emoji: '✨' },
]

export function buildDataset(db: DB, id: CsvDatasetId): { headers: string[]; rows: Cell[][] } {
  switch (id) {
    case 'gastos': {
      const cat = new Map(db.financialCategories.map((c) => [c.id, c.name]))
      return {
        headers: ['Data', 'Descrição', 'Valor (R$)', 'Categoria', 'Pagamento', 'Status', 'Planejado', 'Observações'],
        rows: [...db.expenses]
          .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
          .map((e) => [
            date(e.date),
            e.title,
            money(e.amountCents),
            cat.get(e.categoryId) ?? '',
            e.payment ?? '',
            e.status === 'paid' ? 'pago' : 'compra planejada',
            e.planned,
            e.notes,
          ]),
      }
    }
    case 'tarefas': {
      const proj = new Map(db.projects.map((p) => [p.id, p.name]))
      return {
        headers: ['Título', 'Status', 'Data', 'Prazo', 'Área', 'Prioridade', 'Contexto', 'Projeto', 'Concluída em', 'Notas'],
        rows: db.tasks.map((t) => [
          t.title,
          t.status,
          date(t.date),
          date(t.dueDate),
          t.area,
          t.priority,
          t.context,
          t.projectId ? proj.get(t.projectId) : '',
          t.completedAt ? toDateKey(new Date(t.completedAt)) : '',
          t.notes,
        ]),
      }
    }
    case 'treinos':
      return {
        headers: ['Data', 'Horário', 'Modalidade', 'Status', 'Título', 'Duração (min)', 'Distância (km)', 'Intensidade', 'Sensação (1-5)', 'Notas'],
        rows: [...db.workouts]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((w) => [
            date(w.date),
            w.time,
            modalityOf(db, w.modality).label,
            w.status,
            w.title,
            w.durationMin ?? w.plannedDurationMin,
            w.distanceKm ?? w.plannedDistanceKm,
            w.intensity,
            w.feeling,
            w.notes,
          ]),
      }
    case 'livros':
      return {
        headers: ['Título', 'Autor', 'Status', 'Progresso (%)', 'Início', 'Fim', 'Nota', 'Categoria', 'Notas'],
        rows: db.books.map((b) => [b.title, b.author, b.status, b.progress, date(b.startDate), date(b.endDate), b.rating, b.category, b.notes]),
      }
    case 'estudos': {
      const track = new Map(db.studyTracks.map((t) => [t.id, t.name]))
      return {
        headers: ['Título', 'Trilha', 'Tipo', 'Status', 'Progresso (%)', 'Próximo conteúdo', 'Fonte', 'Link', 'Finalizado em'],
        rows: db.studyItems.map((s) => [
          s.title,
          s.trackId ? track.get(s.trackId) : '',
          s.kind,
          s.status,
          s.progress,
          s.nextContent,
          s.source,
          s.link,
          date(s.finishedAt),
        ]),
      }
    }
    case 'wins': {
      const proj = new Map(db.projects.map((p) => [p.id, p.name]))
      return {
        headers: ['Data', 'Título', 'Tipo', 'Projeto', 'Descrição', 'Impacto', 'Link'],
        rows: [...db.wins]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((w) => [date(w.date), w.title, w.kind, w.projectId ? proj.get(w.projectId) : '', w.description, w.impact, w.link]),
      }
    }
  }
}

export function datasetCSV(db: DB, id: CsvDatasetId): string {
  const { headers, rows } = buildDataset(db, id)
  return toCSV(headers, rows)
}
