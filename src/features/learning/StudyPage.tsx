import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, ArrowUp, Library, Pencil, Play, Plus, Settings2 } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { actions, nextOrder, useDB } from '@/data/store'
import type { StudyItem, StudyTrack } from '@/data/types'
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  Page,
  PageHeader,
  Pill,
  ProgressBar,
  SectionTitle,
  Segmented,
  SheetLayout,
  SortableList,
  SwipeRow,
  TONE,
} from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { formatShortDate } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { SubmitIcon } from './components/SubmitIcon'
import { cn } from '@/lib/cn'
import { pluralize } from '@/lib/text'
import { LocalSheet } from './components/LocalSheet'
import { ProgressSlider } from './components/ProgressSlider'
import { TrackEditor } from './components/TrackEditor'
import { WhatsNext } from './components/WhatsNext'
import { BookCover } from './components/BookCover'
import {
  STUDY_KIND_LABEL,
  activeTracks,
  booksByStatus,
  clampProgress,
  finishStudyPatch,
  mergeSubsetOrder,
  nextStudyOf,
  parseCapture,
  promoteToNextPatch,
  startStudyPatch,
  studyList,
  topOrder,
  trackCounts,
  type StudyView,
} from './selectors'

const VIEWS: { value: StudyView; label: string }[] = [
  { value: 'estudando', label: 'Estudando' },
  { value: 'proximo', label: 'Próximo' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'finalizado', label: 'Finalizados' },
]

type Panel = { kind: 'finished'; item: StudyItem } | { kind: 'tracks' } | { kind: 'pickNext' } | null

function startNow(item: StudyItem, items: StudyItem[]) {
  actions.update('studyItems', item.id, { ...startStudyPatch(item), order: nextOrder(items.filter((i) => i.status === 'estudando')) })
  haptic('light')
  toast(`Bora: ${item.title} 📚`)
}

export default function StudyPage() {
  const nav = useNavigate()
  const today = useToday()
  const items = useDB((db) => db.studyItems)
  const allTracks = useDB((db) => db.studyTracks)
  const books = useDB((db) => db.books)
  const [view, setView] = useState<StudyView>('estudando')
  const [trackId, setTrackId] = useState<string | undefined>()
  const [panel, setPanel] = useState<Panel>(null)

  const tracks = useMemo(() => activeTracks(allTracks), [allTracks])
  const trackById = useMemo(() => new Map(allTracks.map((t) => [t.id, t])), [allTracks])
  const counts = useMemo(() => trackCounts(items), [items])
  const next = useMemo(() => nextStudyOf(items), [items])
  const list = useMemo(() => studyList(items, view, trackId), [items, view, trackId])
  const studyingCount = useMemo(() => items.filter((i) => i.status === 'estudando').length, [items])
  const reading = useMemo(() => booksByStatus(books, 'lendo')[0] ?? booksByStatus(books, 'proximo')[0], [books])

  const finish = (item: StudyItem) => {
    actions.update('studyItems', item.id, finishStudyPatch(today))
    haptic('success')
    toast('Terminou! que orgulho 🎉', { tone: 'win' })
    setPanel({ kind: 'finished', item })
  }

  const newStudy = () =>
    openSheet('study', { defaults: { trackId, status: view === 'finalizado' ? 'backlog' : view } })

  return (
    <Page>
      <PageHeader
        eyebrow="mente"
        title="Estudos"
        subtitle={studyingCount ? `${pluralize(studyingCount, 'coisa', 'coisas')} em andamento — e o próximo já guardado.` : 'o que estou aprendendo — e o que vem depois.'}
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

      <NextHero
        next={next}
        track={next?.trackId ? trackById.get(next.trackId) : undefined}
        hasBacklog={items.some((i) => i.status === 'backlog')}
        onStart={() => next && startNow(next, items)}
        onPick={() => setPanel({ kind: 'pickNext' })}
      />

      <SectionTitle
        action={
          <button type="button" onClick={() => setPanel({ kind: 'tracks' })} className="text-[13px] text-muted h-8 -mb-1.5 px-1 inline-flex items-center gap-1">
            <Settings2 size={14} /> editar
          </button>
        }
      >
        Trilhas
      </SectionTitle>
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        <TrackCard emoji="✦" name="Todas" count={items.filter((i) => i.status !== 'finalizado').length} selected={!trackId} onClick={() => setTrackId(undefined)} tone="ink" />
        {tracks.map((t) => (
          <TrackCard key={t.id} emoji={t.emoji} name={t.name} count={counts.get(t.id) ?? 0} tone={t.tone} selected={trackId === t.id} onClick={() => setTrackId(trackId === t.id ? undefined : t.id)} />
        ))}
        <button
          type="button"
          onClick={() => setPanel({ kind: 'tracks' })}
          className="shrink-0 w-[92px] h-[108px] rounded-2xl border border-dashed border-line text-muted flex flex-col items-center justify-center gap-1 text-[12.5px] active:scale-[0.98] transition"
        >
          <Plus size={18} /> trilha
        </button>
      </div>

      <Segmented className="mt-6" value={view} onChange={setView} options={VIEWS} />

      <div className="mt-3 space-y-2.5">
        {view === 'backlog' && <BacklogCapture trackId={trackId} items={items} />}

        {view === 'estudando' &&
          (list.length ? (
            list.map((it, i) => (
              <motion.div key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <StudyingCard item={it} track={it.trackId ? trackById.get(it.trackId) : undefined} onFinish={() => finish(it)} />
              </motion.div>
            ))
          ) : (
            <Card>
              <EmptyState
                compact
                emoji="🌿"
                title={trackId ? 'Nada em andamento nessa trilha' : 'Nada em andamento agora'}
                text="Começa o próximo quando quiser, sem pressa."
                action={next && <Button size="sm" variant="primary" icon={<Play size={14} />} onClick={() => startNow(next, items)}>começar “{next.title}”</Button>}
              />
            </Card>
          ))}

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
            <Card>
              <EmptyState compact emoji="🧭" title="Fila vazia" text="Escolhe algo do backlog pra ser o próximo — assim nada se perde." action={<Button size="sm" variant="soft" onClick={() => setView('backlog')}>ver backlog</Button>} />
            </Card>
          ))}

        {view === 'backlog' &&
          (list.length ? (
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
            ))
          ) : (
            <EmptyState compact emoji="📥" title="Backlog livre" text="Viu um curso, artigo ou tema legal? Joga aqui em cima." />
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
            <EmptyState compact emoji="🎓" title="Ainda nada por aqui" text="Quando terminar algo, ele vem pra cá — com festa." />
          ))}
      </div>

      {reading && (
        <Card onPress={() => nav(ROUTES.books)} className="mt-8 flex items-center gap-4">
          <BookCover book={reading} width={48} />
          <div className="flex-1 min-w-0">
            <div className="eyebrow">{reading.status === 'lendo' ? 'lendo agora' : 'próximo livro'}</div>
            <div className="font-display text-[18px] leading-tight truncate mt-0.5">{reading.title}</div>
            <div className="text-[13px] text-muted">sua estante de livros</div>
          </div>
          <ArrowRight size={18} className="text-muted" />
        </Card>
      )}

      <LocalSheet open={!!panel} onClose={() => setPanel(null)}>
        {panel?.kind === 'finished' && <WhatsNext finished={panel.item} onDone={() => setPanel(null)} />}
        {panel?.kind === 'tracks' && <TrackEditor onClose={() => setPanel(null)} />}
        {panel?.kind === 'pickNext' && <PickNext items={items} trackById={trackById} onClose={() => setPanel(null)} />}
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

function NextHero({ next, track, hasBacklog, onStart, onPick }: { next?: StudyItem; track?: StudyTrack; hasBacklog: boolean; onStart: () => void; onPick: () => void }) {
  if (!next) {
    return (
      <div className="card p-5 relative overflow-hidden">
        <div className="eyebrow">próximo estudo</div>
        <div className="font-display text-[22px] leading-tight mt-1.5">Qual é o próximo?</div>
        <p className="text-[14px] text-muted mt-1">Deixa ele guardado aqui — quando terminar o atual, já sabe por onde seguir.</p>
        <div className="flex gap-2 mt-4">
          {hasBacklog && (
            <Button size="sm" variant="primary" onClick={onPick}>
              escolher do backlog
            </Button>
          )}
          <Button size="sm" variant={hasBacklog ? 'soft' : 'primary'} icon={<Plus size={14} />} onClick={() => openSheet('study', { defaults: { status: 'proximo' } })}>
            anotar
          </Button>
        </div>
      </div>
    )
  }
  const t = TONE[track?.tone ?? 'accent']
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn('relative overflow-hidden rounded-[var(--radius-card)] p-5', t.soft)}>
      <div className="absolute -right-2 -top-3 text-[84px] leading-none opacity-[0.12] grayscale-[30%] select-none pointer-events-none" aria-hidden>
        {track?.emoji ?? '📚'}
      </div>
      <div className={cn('eyebrow', t.text)}>próximo estudo</div>
      <button type="button" onClick={() => openSheet('study', { id: next.id })} className="block text-left mt-1.5 pr-10">
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

function TrackCard({ emoji, name, count, tone, selected, onClick }: { emoji: string; name: string; count: number; tone: StudyTrack['tone']; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'shrink-0 w-[136px] h-[108px] rounded-2xl p-3 flex flex-col text-left transition active:scale-[0.98] border',
        TONE[tone].soft,
        selected ? 'border-ink shadow-[var(--shadow)]' : 'border-transparent',
      )}
    >
      <span className="text-[22px] leading-none" aria-hidden>
        {emoji}
      </span>
      <span className="mt-auto text-[13.5px] font-medium leading-tight line-clamp-2">{name}</span>
      <span className="text-[12px] text-muted mt-0.5">{count ? `${count} em aberto` : 'tranquilo'}</span>
    </button>
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

      <div className="flex items-center gap-3 mt-3">
        <ProgressBar value={adjusting ? draft : item.progress} tone={tone} className="flex-1 h-2" />
        <span className="text-[13px] font-medium tabular-nums w-10 text-right">{clampProgress(adjusting ? draft : item.progress)}%</span>
      </div>
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
            <Button size="sm" variant="soft" onClick={() => setProgress(item.progress + 10)} disabled={item.progress >= 100}>
              +10%
            </Button>
            <Button
              size="sm"
              variant={adjusting ? 'primary' : 'ghost'}
              onClick={() => {
                if (adjusting) setProgress(draft)
                else setDraft(item.progress)
                setAdjusting((a) => !a)
              }}
            >
              {adjusting ? 'ok' : 'ajustar'}
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
        placeholder="joga aqui: artigo, curso, vídeo, tema, certificação…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        enterKeyHint="done"
        aria-label="Adicionar ao backlog"
      />
      <SubmitIcon label="Guardar no backlog" disabled={!text.trim()} />
    </form>
  )
}

// ─── Pick next from backlog ─────────────────────────────────────────────────

function PickNext({ items, trackById, onClose }: { items: StudyItem[]; trackById: Map<string, StudyTrack>; onClose: () => void }) {
  const backlog = useMemo(() => studyList(items, 'backlog'), [items])
  return (
    <SheetLayout title="Escolher o próximo" eyebrow="do seu backlog" onClose={onClose}>
      {backlog.length ? (
        <div className="card overflow-hidden divide-y divide-line/70">
          {backlog.map((it) => {
            const tr = it.trackId ? trackById.get(it.trackId) : undefined
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  promote(it, items)
                  onClose()
                }}
                className="w-full flex items-center gap-3 min-h-[56px] px-4 py-2.5 text-left active:bg-surface-2"
              >
                <span className="text-[19px] w-7 text-center">{tr?.emoji ?? '📚'}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] truncate">{it.title}</span>
                  {tr && <span className="block text-[12.5px] text-muted">{tr.name}</span>}
                </span>
                <ArrowUp size={16} className="text-muted" />
              </button>
            )
          })}
        </div>
      ) : (
        <EmptyState compact emoji="📥" title="Backlog vazio" />
      )}
    </SheetLayout>
  )
}
