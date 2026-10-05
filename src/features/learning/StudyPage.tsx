import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, ArrowUp, Library, Pencil, Play, Plus, Settings2, X } from 'lucide-react'
import { SavedContent } from './components/SavedContent'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { actions, nextOrder, useDB } from '@/data/store'
import type { StudyItem, StudyTrack } from '@/data/types'
import {
  Button,
  Card,
  IconButton,
  Page,
  PageHeader,
  Pill,
  ProgressBar,
  SectionTitle,
  Segmented,
  SortableList,
  SwipeRow,
  TONE,
} from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { formatShortDate } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { SubmitIcon } from './components/SubmitIcon'
import { cn } from '@/lib/cn'
import { LocalSheet } from './components/LocalSheet'
import { ProgressSlider } from './components/ProgressSlider'
import { TrackEditor } from './components/TrackEditor'
import { WhatsNext } from './components/WhatsNext'
import { BookCover } from './components/BookCover'
import {
  STUDY_KIND_LABEL,
  TRACK_STATUS_LABEL,
  booksByStatus,
  clampProgress,
  finishStudyPatch,
  formatQuickCreate,
  mergeSubsetOrder,
  nextStudyOf,
  nextTrackStatus,
  parseCapture,
  promoteToNextPatch,
  readingWhere,
  savedContent,
  startStudyPatch,
  studyItemsOnly,
  studyList,
  topOrder,
  trackStatus,
  tracksForDisplay,
  type StudyView,
} from './selectors'

type BacklogView = Exclude<StudyView, 'estudando'>

const VIEWS: { value: BacklogView; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'proximo', label: 'Fila' },
  { value: 'finalizado', label: 'Finalizados' },
]

type Panel = { kind: 'finished'; item: StudyItem } | { kind: 'tracks' } | null

function startNow(item: StudyItem, items: StudyItem[]) {
  actions.update('studyItems', item.id, { ...startStudyPatch(item), order: nextOrder(items.filter((i) => i.status === 'estudando')) })
  haptic('light')
  toast(`Bora: ${item.title} 📚`)
}

/** Tap a format chip ("Cambly") → open the existing item or create it straight into "estudando". */
function quickFormat(track: StudyTrack, format: string, items: StudyItem[]) {
  const res = formatQuickCreate(track, format, items)
  if (res.type === 'existing') {
    openSheet('study', { id: res.item.id })
    return
  }
  const created = actions.create('studyItems', res.data)
  haptic('light')
  toast(`${track.emoji} ${format} anotado em “agora estou estudando”`, {
    action: { label: 'editar', run: () => openSheet('study', { id: created.id }) },
  })
}

function cycleTrackStatus(track: StudyTrack) {
  const prev = track.status
  const next = nextTrackStatus(track)
  actions.update('studyTracks', track.id, { status: next })
  haptic('light')
  toast(`${track.name}: ${TRACK_STATUS_LABEL[next]}`, { action: { label: 'Desfazer', run: () => actions.update('studyTracks', track.id, { status: prev }) } })
}

export default function StudyPage() {
  const nav = useNavigate()
  const today = useToday()
  const [params] = useSearchParams()
  const items = useDB((db) => db.studyItems)
  const allTracks = useDB((db) => db.studyTracks)
  const books = useDB((db) => db.books)
  const [view, setView] = useState<BacklogView>('backlog')
  const [trackId, setTrackId] = useState<string | undefined>()
  const [panel, setPanel] = useState<Panel>(null)
  const savedRef = useRef<HTMLElement>(null)

  const tracks = useMemo(() => tracksForDisplay(allTracks), [allTracks])
  const trackById = useMemo(() => new Map(allTracks.map((t) => [t.id, t])), [allTracks])
  const next = useMemo(() => nextStudyOf(items), [items])
  const studying = useMemo(() => studyList(items, 'estudando'), [items])
  const list = useMemo(() => studyList(items, view, trackId), [items, view, trackId])
  const hasQueue = useMemo(() => studyItemsOnly(items).some((i) => i.status !== 'estudando' && i.status !== 'pausado'), [items])
  const saved = useMemo(() => savedContent(items), [items])
  const reading = useMemo(() => booksByStatus(books, 'lendo')[0] ?? booksByStatus(books, 'proximo')[0], [books])
  const filterTrack = trackId ? trackById.get(trackId) : undefined
  const wantsSaved = params.get('v') === 'salvos'

  // /estudos?v=salvos → straight to "Conteúdos salvos" (Espaços → Aprender, Lumos)
  useEffect(() => {
    if (wantsSaved) savedRef.current?.scrollIntoView({ block: 'start' })
  }, [wantsSaved])

  const finish = (item: StudyItem) => {
    actions.update('studyItems', item.id, finishStudyPatch(today))
    haptic('success')
    toast('Terminou! que orgulho 🎉', { tone: 'win' })
    setPanel({ kind: 'finished', item })
  }

  const newStudy = () => openSheet('study', { defaults: { trackId, status: 'backlog' } })

  return (
    <Page>
      <PageHeader
        eyebrow="aprender"
        title="Estudos"
        subtitle="o que estou aprendendo — e o que eu guardo pra quando quiser."
        actions={
          <>
            <IconButton label="Livros" onClick={() => nav(ROUTES.books)}>
              <Library size={20} />
            </IconButton>
            <IconButton label="Novo estudo" onClick={newStudy}>
              <Plus size={22} />
            </IconButton>
          </>
        }
      />

      {studying.length > 0 && (
        <>
          <SectionTitle className="mt-1">Agora estou estudando</SectionTitle>
          <div className="space-y-2.5">
            {studying.map((it, i) => (
              <motion.div key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <StudyingCard item={it} track={it.trackId ? trackById.get(it.trackId) : undefined} onFinish={() => finish(it)} />
              </motion.div>
            ))}
          </div>
        </>
      )}

      {next && (
        <>
          <SectionTitle>Próximo estudo</SectionTitle>
          <NextHero next={next} track={next.trackId ? trackById.get(next.trackId) : undefined} onStart={() => startNow(next, items)} />
        </>
      )}

      <SectionTitle
        className={studying.length || next ? undefined : 'mt-1'}
        action={
          <button type="button" onClick={() => setPanel({ kind: 'tracks' })} className="text-[13px] text-muted h-8 -mb-1.5 px-1 inline-flex items-center gap-1">
            <Settings2 size={14} /> editar
          </button>
        }
      >
        Trilhas
      </SectionTitle>
      <div className="space-y-2.5">
        {tracks.map((t, i) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <TrackCard
              track={t}
              current={studying.filter((s) => s.trackId === t.id && s.status === 'estudando')}
              selected={trackId === t.id}
              onSelect={() => setTrackId(trackId === t.id ? undefined : t.id)}
              onStatus={() => cycleTrackStatus(t)}
              onFormat={(f) => quickFormat(t, f, items)}
              onEdit={() => setPanel({ kind: 'tracks' })}
            />
          </motion.div>
        ))}
        {tracks.length === 0 && (
          <button
            type="button"
            onClick={() => setPanel({ kind: 'tracks' })}
            className="w-full h-12 rounded-2xl border border-dashed border-line text-muted inline-flex items-center justify-center gap-1.5 text-[13.5px] active:scale-[0.99] transition"
          >
            <Plus size={16} /> nova trilha
          </button>
        )}
      </div>

      {hasQueue && (
        <>
          <SectionTitle
            action={
              filterTrack && (
                <button type="button" onClick={() => setTrackId(undefined)} className="text-[13px] text-muted h-8 -mb-1.5 px-1 inline-flex items-center gap-1">
                  {filterTrack.emoji} só {filterTrack.name} <X size={14} />
                </button>
              )
            }
          >
            Pra estudar depois
          </SectionTitle>
          <Segmented value={view} onChange={setView} options={VIEWS} />

          <div className="mt-3 space-y-2.5">
            {view === 'backlog' && <BacklogCapture trackId={trackId} items={items} />}

            {view === 'proximo' &&
              (list.length ? (
                <SortableList
                  items={list}
                  className="space-y-2"
                  onReorder={(ids) => {
                    const all = studyList(items, 'proximo').map((i) => i.id)
                    actions.reorder('studyItems', mergeSubsetOrder(all, ids))
                  }}
                  renderItem={(it, handle) => (
                    <StudyRow
                      item={it}
                      track={it.trackId ? trackById.get(it.trackId) : undefined}
                      handle={handle}
                      badge={it.id === next?.id ? 'o próximo' : undefined}
                      completeLabel="Começar"
                      onComplete={() => startNow(it, items)}
                      trailing={
                        <IconButton label={`Começar ${it.title}`} variant="soft" size="sm" onClick={() => startNow(it, items)}>
                          <Play size={14} />
                        </IconButton>
                      }
                    />
                  )}
                />
              ) : (
                <p className="text-[14px] text-muted px-1">Fila vazia — escolhe algo do backlog quando der.</p>
              ))}

            {view === 'backlog' &&
              list.map((it) => (
                <StudyRow
                  key={it.id}
                  item={it}
                  track={it.trackId ? trackById.get(it.trackId) : undefined}
                  completeLabel="Próximo"
                  onComplete={() => promote(it, items)}
                  trailing={
                    <IconButton label={`Tornar ${it.title} o próximo estudo`} variant="soft" size="sm" onClick={() => promote(it, items)}>
                      <ArrowUp size={15} />
                    </IconButton>
                  }
                />
              ))}

            {view === 'finalizado' &&
              (list.length ? (
                list.map((it) => (
                  <StudyRow
                    key={it.id}
                    item={it}
                    track={it.trackId ? trackById.get(it.trackId) : undefined}
                    subtitle={it.finishedAt ? `terminou ${formatShortDate(it.finishedAt)} 🎉` : 'finalizado 🎉'}
                  />
                ))
              ) : (
                <p className="text-[14px] text-muted px-1">Quando terminar algo, ele vem pra cá — com festa. 🎓</p>
              ))}
          </div>
        </>
      )}

      <section ref={savedRef} id="salvos" className="scroll-mt-4">
        <SectionTitle>Conteúdos salvos</SectionTitle>
        <SavedContent groups={saved} items={items} trackById={trackById} />
      </section>

      {reading && (
        <Card onPress={() => nav(ROUTES.books)} className="mt-8 flex items-center gap-4">
          <BookCover book={reading} width={48} />
          <div className="flex-1 min-w-0">
            <div className="eyebrow">{reading.status === 'lendo' ? 'lendo agora' : 'próximo livro'}</div>
            <div className="font-display text-[18px] leading-tight truncate mt-0.5">{reading.title}</div>
            <div className="text-[13px] text-muted truncate">{(reading.status === 'lendo' && readingWhere(reading)) || reading.author || 'sua estante'}</div>
          </div>
          <ArrowRight size={18} className="text-muted" />
        </Card>
      )}

      <LocalSheet open={!!panel} onClose={() => setPanel(null)}>
        {panel?.kind === 'finished' && <WhatsNext finished={panel.item} onDone={() => setPanel(null)} />}
        {panel?.kind === 'tracks' && <TrackEditor onClose={() => setPanel(null)} />}
      </LocalSheet>
    </Page>
  )
}

function promote(it: StudyItem, items: StudyItem[]) {
  actions.update('studyItems', it.id, promoteToNextPatch(items))
  haptic('light')
  toast(`“${it.title}” é o próximo estudo ✨`)
}

// ─── Hero ───────────────────────────────────────────────────────────────────

function NextHero({ next, track, onStart }: { next: StudyItem; track?: StudyTrack; onStart: () => void }) {
  const t = TONE[track?.tone ?? 'accent']
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn('relative overflow-hidden rounded-[var(--radius-card)] p-5', t.soft)}>
      <div className="absolute -right-2 -top-3 text-[84px] leading-none opacity-[0.12] grayscale-[30%] select-none pointer-events-none" aria-hidden>
        {track?.emoji ?? '📚'}
      </div>
      <button type="button" onClick={() => openSheet('study', { id: next.id })} className="block text-left pr-10">
        <span className="font-display text-[26px] leading-[1.1] tracking-tight">{next.title}</span>
      </button>
      <div className="text-[13.5px] text-ink-2 mt-1.5">
        {[track ? `${track.emoji} ${track.name}` : null, STUDY_KIND_LABEL[next.kind], next.source].filter(Boolean).join(' · ')}
      </div>
      {next.nextContent && <div className="text-[13.5px] text-ink-2 mt-1">começa por: {next.nextContent}</div>}
      <div className="flex items-center gap-2 mt-4">
        <Button variant="accent" icon={<Play size={15} fill="currentColor" />} onClick={onStart}>
          começar agora
        </Button>
        <Button variant="ghost" size="sm" onClick={() => openSheet('study', { id: next.id })}>
          detalhes
        </Button>
      </div>
    </motion.div>
  )
}

// ─── Tracks ─────────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  ativo: 'bg-sage-soft text-sage',
  continuo: 'bg-ocean-soft text-ocean',
  pausado: 'bg-surface-2 text-muted',
} as const

function TrackCard({
  track,
  current,
  selected,
  onSelect,
  onStatus,
  onFormat,
  onEdit,
}: {
  track: StudyTrack
  current: StudyItem[]
  selected: boolean
  onSelect: () => void
  onStatus: () => void
  onFormat: (format: string) => void
  onEdit: () => void
}) {
  const status = trackStatus(track)
  const formats = track.formats ?? []
  const tone = TONE[track.tone]
  return (
    <div className={cn('card p-3.5 border transition', selected ? 'border-ink' : 'border-transparent', status === 'pausado' && 'opacity-70')}>
      <div className="flex items-center gap-3">
        <button type="button" aria-pressed={selected} onClick={onSelect} className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-11">
          <span className={cn('h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center text-[22px]', tone.soft)} aria-hidden>
            {track.emoji}
          </span>
          <span className="min-w-0">
            <span className="block text-[16px] font-medium leading-tight truncate">{track.name}</span>
            {current.length > 0 ? (
              <span className="block text-[12.5px] text-muted truncate mt-0.5">agora: {current.map((c) => c.title).join(' · ')}</span>
            ) : status === 'pausado' ? (
              <span className="block text-[12.5px] text-muted mt-0.5">pausada, sem pressa</span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          onClick={onStatus}
          aria-label={`Status de ${track.name}: ${TRACK_STATUS_LABEL[status]}. Tocar para mudar`}
          className="shrink-0 h-11 -my-1 -mr-1 px-1 inline-flex items-center"
        >
          <span className={cn('inline-flex items-center h-7 px-3 rounded-full text-[12.5px] font-medium', STATUS_STYLE[status])}>{TRACK_STATUS_LABEL[status]}</span>
        </button>
      </div>
      {track.notes && <p className="text-[13.5px] text-ink-2 leading-snug mt-2 px-0.5">{track.notes}</p>}
      {formats.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFormat(f)}
              aria-label={`Estudar ${f} agora`}
              className="inline-flex items-center gap-1 h-9 pl-2.5 pr-3 rounded-full text-[13px] bg-surface-2 text-ink-2 active:scale-[0.97] transition"
            >
              <Plus size={13} className="text-muted" /> {f}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" onClick={onEdit} className="mt-2 h-9 px-1 text-[13px] text-muted inline-flex items-center gap-1">
          <Plus size={13} /> como você estuda isso?
        </button>
      )}
    </div>
  )
}

// ─── Estudando ──────────────────────────────────────────────────────────────

function StudyingCard({ item, track, onFinish }: { item: StudyItem; track?: StudyTrack; onFinish: () => void }) {
  const [adjusting, setAdjusting] = useState(false)
  const [draft, setDraft] = useState(item.progress)
  const [editingNext, setEditingNext] = useState(false)
  const paused = item.status === 'pausado'
  const tone = track?.tone ?? 'sage'

  const setProgress = (p: number) => {
    const v = clampProgress(p)
    actions.update('studyItems', item.id, { progress: v })
    if (v === 100 && item.progress < 100) {
      toast('Chegou em 100%! Terminou mesmo?', { action: { label: 'terminei 🎉', run: onFinish } })
    }
  }

  return (
    <div className={cn('card p-4', paused && 'opacity-75')}>
      <div className="flex items-center gap-2">
        {track && (
          <span className={cn('inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[12px] font-medium', TONE[tone].soft, TONE[tone].text)}>
            {track.emoji} {track.name}
          </span>
        )}
        <span className="text-[12px] text-muted">{STUDY_KIND_LABEL[item.kind]}</span>
        {paused && <Pill>pausado</Pill>}
        <IconButton label="Editar estudo" size="sm" className="ml-auto -mr-1.5" onClick={() => openSheet('study', { id: item.id })}>
          <Pencil size={15} />
        </IconButton>
      </div>
      <button type="button" className="block text-left mt-1" onClick={() => openSheet('study', { id: item.id })}>
        <span className="font-display text-[20px] leading-tight">{item.title}</span>
      </button>

      {editingNext ? (
        <input
          autoFocus
          className="input mt-2 py-2"
          defaultValue={item.nextContent ?? ''}
          placeholder="próximo conteúdo…"
          onBlur={(e) => {
            actions.update('studyItems', item.id, { nextContent: e.target.value.trim() || undefined })
            setEditingNext(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <button type="button" onClick={() => setEditingNext(true)} className="mt-1.5 flex items-start gap-1.5 text-left text-[14px] text-ink-2 min-h-8">
          <ArrowRight size={15} className="mt-[3px] shrink-0 text-muted" />
          {item.nextContent ? <span>{item.nextContent}</span> : <span className="text-muted">qual o próximo conteúdo?</span>}
        </button>
      )}

      {/* ongoing things (a conversation class, a trilha) don't need a percent until she gives one */}
      {(adjusting || item.progress > 0) && (
        <div className="flex items-center gap-3 mt-3">
          <ProgressBar value={adjusting ? draft : item.progress} tone={tone} className="flex-1 h-2" />
          <span className="text-[13px] font-medium tabular-nums w-10 text-right">{clampProgress(adjusting ? draft : item.progress)}%</span>
        </div>
      )}
      {adjusting && (
        <ProgressSlider
          value={draft}
          onChange={setDraft}
          onCommit={(v) => {
            setProgress(v)
          }}
        />
      )}

      <div className="flex items-center gap-2 mt-3">
        {paused ? (
          <Button size="sm" variant="soft" icon={<Play size={13} />} onClick={() => actions.update('studyItems', item.id, { status: 'estudando' })}>
            retomar
          </Button>
        ) : (
          <>
            {item.progress > 0 && (
              <Button size="sm" variant="soft" onClick={() => setProgress(item.progress + 10)} disabled={item.progress >= 100}>
                +10%
              </Button>
            )}
            <Button
              size="sm"
              variant={adjusting ? 'primary' : 'ghost'}
              onClick={() => {
                if (adjusting) setProgress(draft)
                else setDraft(item.progress)
                setAdjusting((a) => !a)
              }}
            >
              {adjusting ? 'ok' : item.progress > 0 ? 'ajustar' : 'marcar progresso'}
            </Button>
          </>
        )}
        <Button size="sm" variant="accent" className="ml-auto" onClick={onFinish}>
          terminei 🎉
        </Button>
      </div>
    </div>
  )
}

// ─── Rows ───────────────────────────────────────────────────────────────────

function StudyRow({
  item,
  track,
  handle,
  badge,
  trailing,
  subtitle,
  onComplete,
  completeLabel,
}: {
  item: StudyItem
  track?: StudyTrack
  handle?: ReactNode
  badge?: string
  trailing?: ReactNode
  subtitle?: string
  onComplete?: () => void
  completeLabel?: string
}) {
  const sub = subtitle ?? [STUDY_KIND_LABEL[item.kind], item.source, item.nextContent && `→ ${item.nextContent}`].filter(Boolean).join(' · ')
  return (
    <SwipeRow className="card" onComplete={onComplete} completeLabel={completeLabel} onDelete={() => removeWithUndo('studyItems', item.id, 'Estudo apagado')}>
      <div className={cn('flex items-center gap-2 min-h-[60px] py-2 pr-3', handle ? 'pl-1' : 'pl-4')}>
        {handle}
        <span className="text-[19px] w-7 text-center shrink-0" aria-hidden>
          {track?.emoji ?? '📚'}
        </span>
        <button type="button" onClick={() => openSheet('study', { id: item.id })} className="flex-1 min-w-0 text-left py-1">
          <span className="flex items-center gap-2">
            <span className="text-[15px] leading-snug truncate">{item.title}</span>
            {badge && <Pill className="bg-accent-soft text-accent shrink-0">{badge}</Pill>}
          </span>
          {sub && <span className="block text-[12.5px] text-muted truncate mt-0.5">{sub}</span>}
        </button>
        {trailing}
      </div>
    </SwipeRow>
  )
}

// ─── Backlog capture ────────────────────────────────────────────────────────

function BacklogCapture({ trackId, items }: { trackId?: string; items: StudyItem[] }) {
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (!t) return
    const parsed = parseCapture(t)
    actions.create('studyItems', {
      ...parsed,
      trackId,
      status: 'backlog',
      progress: 0,
      order: topOrder(items.filter((i) => i.status === 'backlog')),
    })
    setText('')
    haptic('light')
    toast(parsed.link ? `Link guardado: ${parsed.title} 🔗` : 'Guardado no backlog 📥')
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
        placeholder="joga aqui: curso, artigo, tema, link…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        enterKeyHint="done"
        aria-label="Adicionar ao backlog"
      />
      <SubmitIcon label="Guardar no backlog" disabled={!text.trim()} />
    </form>
  )
}
