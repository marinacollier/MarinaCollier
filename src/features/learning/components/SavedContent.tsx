import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { actions } from '@/data/store'
import type { StudyItem, StudyTrack } from '@/data/types'
import { SwipeRow } from '@/components/ui'
import { haptic } from '@/lib/haptics'
import { SubmitIcon } from './SubmitIcon'
import { parseCapture, topOrder, type SavedGroup } from '../selectors'

const KIND_EMOJI: Partial<Record<StudyItem['kind'], string>> = { newsletter: '📰', podcast: '🎧', tema: '💡', video: '🎬', curso: '🎓', livro: '📖' }

/**
 * "Conteúdos salvos": newsletters she follows, themes she wants to go deeper into, links she kept.
 * Reference only — no status, no dates, no "atrasado". A row opens its link; edit lives in the sheet.
 */
export function SavedContent({ groups, items, trackById }: { groups: SavedGroup[]; items: StudyItem[]; trackById: Map<string, StudyTrack> }) {
  return (
    <div className="space-y-5">
      {groups.map((g, gi) => (
        <motion.div key={g.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.05 }}>
          <div className="text-[12.5px] text-muted px-1 mb-1.5">{g.label}</div>
          <div className="space-y-2">
            {g.items.map((it) => (
              <SavedRow key={it.id} item={it} track={it.trackId ? trackById.get(it.trackId) : undefined} />
            ))}
          </div>
        </motion.div>
      ))}
      <SaveCapture items={items} empty={groups.length === 0} />
    </div>
  )
}

function SavedRow({ item, track }: { item: StudyItem; track?: StudyTrack }) {
  const sub = [item.source, item.notes ?? (track ? track.name : undefined)].filter(Boolean).join(' · ')
  const body = (
    <>
      <span className="text-[19px] w-7 text-center shrink-0" aria-hidden>
        {KIND_EMOJI[item.kind] ?? '🔖'}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15.5px] leading-snug truncate">{item.title}</span>
        {sub && <span className="block text-[12.5px] text-muted truncate mt-0.5">{sub}</span>}
      </span>
    </>
  )
  return (
    <SwipeRow
      className="card"
      onDelete={() => removeWithUndo('studyItems', item.id, 'Tirei dos salvos')}
      completeLabel="Editar"
      onComplete={() => openSheet('study', { id: item.id })}
    >
      {item.link ? (
        <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 min-h-[60px] pl-4 pr-4 py-2">
          {body}
          <ArrowUpRight size={17} className="text-muted shrink-0" aria-label="abre o link" />
        </a>
      ) : (
        <button type="button" onClick={() => openSheet('study', { id: item.id })} className="w-full flex items-center gap-3 min-h-[60px] pl-4 pr-4 py-2 text-left">
          {body}
        </button>
      )}
    </SwipeRow>
  )
}

/** Keep a link or a theme for later — straight into the references, never into a queue. */
function SaveCapture({ items, empty }: { items: StudyItem[]; empty: boolean }) {
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (!t) return
    const parsed = parseCapture(t)
    actions.create('studyItems', {
      ...parsed,
      reference: true,
      status: 'backlog',
      progress: 0,
      order: topOrder(items.filter((i) => i.reference)),
    })
    setText('')
    haptic('light')
    toast(parsed.link ? `Guardado: ${parsed.title} 🔗` : 'Guardado pra quando quiser 💡')
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
      className="flex gap-2"
    >
      <input
        className="input flex-1"
        placeholder={empty ? 'guarda aqui um link ou tema pra depois…' : 'guardar link ou tema…'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        enterKeyHint="done"
        aria-label="Guardar conteúdo"
      />
      <SubmitIcon label="Guardar conteúdo" disabled={!text.trim()} />
    </form>
  )
}
