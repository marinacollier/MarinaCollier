import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { closeSheet } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { SheetLayout } from '@/components/ui'
import { useDB } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { formatBRL } from '@/lib/money'
import { haptic } from '@/lib/haptics'
import { runAction, sheetAction, type ResultAction } from '@/features/search/actions'
import { search, topResults } from '@/features/search/engine'
import { pushRecent } from '@/features/search/recent'
import { ResultRow } from '@/features/search/ResultViews'
import { askMariCommand, buildCommands, filterCommands, SECTION_LABEL } from './commands'

interface Row {
  key: string
  section: string
  emoji?: string
  title: string
  subtitle?: string
  action: ResultAction
  fromSearch?: boolean
}

export default function CommandPaletteSheet({ query: initial = '' }: SheetProps<'commandPalette'>) {
  const db = useDB()
  const today = useToday()
  const navigate = useNavigate()
  const [query, setQuery] = useState(initial)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo(() => buildCommands(db, today), [db, today])

  const rows = useMemo<Row[]>(() => {
    const q = query.trim()
    const out: Row[] = filterCommands(commands, q).map((c) => ({
      key: c.id,
      section: SECTION_LABEL[c.section],
      emoji: c.emoji,
      title: c.label,
      action: c.action,
    }))
    if (q.length >= 2) {
      const res = search(db, q, today)
      if (res.summary) {
        out.push({
          key: 'money-summary',
          section: 'Na busca',
          emoji: '💸',
          title: `${res.summary.title} · ${res.summary.periodLabel}`,
          subtitle: `${formatBRL(res.summary.totalCents)} · ${res.summary.count} ${res.summary.count === 1 ? 'gasto' : 'gastos'}`,
          action: res.summary.action,
          fromSearch: true,
        })
      }
      for (const r of topResults(res, res.summary ? 4 : 6)) {
        out.push({ key: r.key, section: 'Na busca', emoji: r.emoji, title: r.title, subtitle: r.subtitle, action: r.action, fromSearch: true })
      }
      if (out.length === 0) {
        out.push({ key: 'dump', section: 'Criar', emoji: '🧠', title: `Tirar da cabeça: “${q}”`, action: sheetAction('brainDump', { text: q }) })
      }
      const mari = askMariCommand(q)
      out.push({ key: mari.id, section: SECTION_LABEL.mari, emoji: mari.emoji, title: mari.label, action: mari.action })
    }
    return out
  }, [commands, db, query, today])

  const safeActive = Math.min(active, Math.max(0, rows.length - 1))

  useEffect(() => {
    document.getElementById(`cmd-row-${safeActive}`)?.scrollIntoView({ block: 'nearest' })
  }, [safeActive])

  const run = (row: Row) => {
    haptic('light')
    if (row.fromSearch) pushRecent(query)
    runAction(row.action, navigate, 'sheet')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (rows.length ? (Math.min(i, rows.length - 1) + 1) % rows.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (rows.length ? (Math.min(i, rows.length - 1) - 1 + rows.length) % rows.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = rows[safeActive]
      if (row) run(row)
    }
  }

  return (
    <SheetLayout eyebrow="Atalhos" title="O que vamos fazer?" onClose={closeSheet} className="pb-6">
      <div className="sticky top-0 z-10 bg-surface pb-1">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            autoFocus
            type="text"
            enterKeyHint="go"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-activedescendant={rows.length ? `cmd-row-${safeActive}` : undefined}
            aria-label="Buscar comando ou qualquer coisa"
            placeholder="Criar, abrir, ir para… ou buscar"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            className="input h-12 pl-10"
          />
        </div>
      </div>

      <div id="cmd-list" role="listbox" ref={listRef}>
        {rows.map((row, i) => (
          <div key={row.key} role="option" aria-selected={i === safeActive}>
            {(i === 0 || rows[i - 1].section !== row.section) && <div className={i === 0 ? 'eyebrow px-1 pb-1.5' : 'eyebrow px-1 pt-4 pb-1.5'}>{row.section}</div>}
            <div className="rounded-2xl overflow-hidden" onMouseMove={() => i !== safeActive && setActive(i)}>
              <ResultRow id={`cmd-row-${i}`} emoji={row.emoji} title={row.title} subtitle={row.subtitle} active={i === safeActive} onPress={() => run(row)} />
            </div>
          </div>
        ))}
      </div>

      <p className="hidden md:block text-[12px] text-muted text-center pt-4">↑ ↓ para navegar · Enter para abrir · Esc para fechar</p>
    </SheetLayout>
  )
}
