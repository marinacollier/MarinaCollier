import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { actions, nextOrder, useDB } from '@/data/store'
import type { StudyTrack, Tone } from '@/data/types'
import { IconButton, SheetLayout, TONE, TONES } from '@/components/ui'
import { SubmitIcon } from './SubmitIcon'
import { cn } from '@/lib/cn'

/** Keep only the last typed emoji (graphemes, so flags and ZWJ emojis survive). */
function lastGrapheme(text: string): string {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Seg) {
    const parts = [...new Seg('pt-BR', { granularity: 'grapheme' }).segment(text)]
    return parts.at(-1)?.segment ?? ''
  }
  return [...text].slice(-2).join('')
}

function ToneDots({ value, onChange }: { value: Tone; onChange: (t: Tone) => void }) {
  return (
    <div className="flex gap-1.5">
      {TONES.map((t) => (
        <button
          key={t}
          type="button"
          aria-label={`cor ${t}`}
          aria-pressed={value === t}
          onClick={() => onChange(t)}
          className="h-8 w-8 -m-0.5 inline-flex items-center justify-center rounded-full"
        >
          <span className={cn('h-5 w-5 rounded-full transition', TONE[t].dot, value === t ? 'ring-2 ring-offset-2 ring-ink/70 ring-offset-surface' : 'opacity-70')} />
        </button>
      ))}
    </div>
  )
}

function TrackRow({ track }: { track: StudyTrack }) {
  return (
    <div className="card p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <input
          aria-label="emoji"
          className="input w-12 px-0 text-center text-[20px] py-2"
          value={track.emoji}
          onChange={(e) => actions.update('studyTracks', track.id, { emoji: lastGrapheme(e.target.value) || '📚' })}
        />
        <input aria-label="nome da trilha" className="input flex-1 py-2.5" value={track.name} onChange={(e) => actions.update('studyTracks', track.id, { name: e.target.value })} />
        <IconButton
          label="Arquivar trilha"
          onClick={() => {
            actions.update('studyTracks', track.id, { archived: true })
            toast(`${track.name} arquivada`, { action: { label: 'Desfazer', run: () => actions.update('studyTracks', track.id, { archived: false }) } })
          }}
        >
          <Archive size={18} />
        </IconButton>
      </div>
      <div className="pl-1">
        <ToneDots value={track.tone} onChange={(tone) => actions.update('studyTracks', track.id, { tone })} />
      </div>
    </div>
  )
}

/** Small editor: add / rename / emoji / tone / archive. Changes apply as you type. */
export function TrackEditor({ onClose }: { onClose: () => void }) {
  const tracks = useDB((db) => db.studyTracks)
  const active = useMemo(() => tracks.filter((t) => !t.archived).sort((a, b) => a.order - b.order), [tracks])
  const archived = useMemo(() => tracks.filter((t) => t.archived), [tracks])
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('✨')

  const add = () => {
    const n = name.trim()
    if (!n) return
    actions.create('studyTracks', { name: n, emoji: emoji || '📚', tone: TONES[tracks.length % TONES.length], order: nextOrder(tracks), archived: false })
    setName('')
    setEmoji('✨')
    toast(`Trilha “${n}” criada 🌱`)
  }

  return (
    <SheetLayout title="Trilhas" eyebrow="seus caminhos de estudo" onClose={onClose} primary={{ label: 'Pronto', onClick: onClose }}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input aria-label="emoji da nova trilha" className="input w-12 px-0 text-center text-[20px]" value={emoji} onChange={(e) => setEmoji(lastGrapheme(e.target.value))} />
        <input className="input flex-1" placeholder="nova trilha (ex.: Espanhol)" value={name} onChange={(e) => setName(e.target.value)} />
        <SubmitIcon label="Criar trilha" disabled={!name.trim()} />
      </form>
      <div className="space-y-2.5">
        {active.map((t) => (
          <TrackRow key={t.id} track={t} />
        ))}
      </div>
      {archived.length > 0 && (
        <div>
          <div className="eyebrow px-1 mb-2">arquivadas</div>
          <div className="card overflow-hidden divide-y divide-line/70">
            {archived.map((t) => (
              <div key={t.id} className="flex items-center gap-3 pl-4 pr-1 min-h-[52px]">
                <span className="text-[18px]">{t.emoji}</span>
                <span className="flex-1 text-[15px] text-muted">{t.name}</span>
                <IconButton label="Restaurar trilha" onClick={() => actions.update('studyTracks', t.id, { archived: false })}>
                  <ArchiveRestore size={18} />
                </IconButton>
              </div>
            ))}
          </div>
        </div>
      )}
    </SheetLayout>
  )
}
