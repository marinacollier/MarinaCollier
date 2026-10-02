import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, ChevronDown, Maximize2, Pin, Plus } from 'lucide-react'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { Button, EmptyState, Page, PageHeader, Segmented, SwipeRow } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { BrainDumpItem, Note } from '@/data/types'
import { useToday } from '@/hooks/useToday'
import { cn } from '@/lib/cn'
import { relativeDay, toDateKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { captureText, CONVERTED_LABEL } from './triage'
import { INBOX_GROUPS } from './seed'

type Tab = 'inbox' | 'notas'

const groupRank = (g: string) => {
  const i = (INBOX_GROUPS as readonly string[]).indexOf(g)
  return i === -1 ? INBOX_GROUPS.length : i
}

function CaptureBar() {
  const [text, setText] = useState('')
  const save = () => {
    if (!captureText(text, false)) return
    haptic('success')
    toast('Guardado ✓')
    setText('')
  }
  return (
    <div className="card flex items-end gap-1 pl-4 pr-1.5 py-1.5">
      <textarea
        value={text}
        rows={1}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text')
          if (pasted.includes('\n')) {
            e.preventDefault()
            openSheet('brainDump', { text: (text ? text + '\n' : '') + pasted })
            setText('')
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            save()
          }
        }}
        enterKeyHint="send"
        placeholder="O que tá na tua cabeça?"
        aria-label="Capturar na inbox"
        className="flex-1 bg-transparent outline-none resize-none py-2.5 leading-snug placeholder:text-muted/80 max-h-32 field-sizing-content"
      />
      {text.trim() ? (
        <button type="button" onClick={save} aria-label="Guardar" className="h-10 w-10 mb-0.5 rounded-full bg-accent text-white inline-flex items-center justify-center shrink-0 active:scale-95 transition">
          <ArrowUp size={19} strokeWidth={2.4} />
        </button>
      ) : (
        <button type="button" onClick={() => openSheet('brainDump')} aria-label="Abrir captura grande" className="h-10 w-10 mb-0.5 rounded-full text-muted inline-flex items-center justify-center shrink-0 active:bg-surface-2">
          <Maximize2 size={17} />
        </button>
      )}
    </div>
  )
}

function ItemRow({ item, today }: { item: BrainDumpItem; today: string }) {
  const processed = item.status !== 'inbox'
  return (
    <SwipeRow
      className="rounded-none"
      completeLabel="Arquivar"
      onComplete={
        processed
          ? undefined
          : () => {
              actions.update('brainDump', item.id, { status: 'arquivado' })
              toast('Arquivado', { action: { label: 'Desfazer', run: () => actions.update('brainDump', item.id, { status: 'inbox' }) } })
            }
      }
      onDelete={() => removeWithUndo('brainDump', item.id, 'Apagado da inbox')}
    >
      <button type="button" onClick={() => openSheet('brainDumpTriage', { id: item.id })} className="w-full text-left flex items-start gap-3 px-4 py-3.5 min-h-[52px] active:bg-surface-2 transition-colors">
        <span className={cn('mt-[7px] h-2 w-2 rounded-full shrink-0', processed ? 'bg-sage' : 'bg-accent/70')} aria-hidden />
        <span className="flex-1 min-w-0">
          <span className={cn('block text-[15px] leading-snug line-clamp-3 whitespace-pre-line', processed && 'text-muted')}>{item.text}</span>
          {(processed || toDateKey(new Date(item.createdAt)) !== today) && (
          <span className="block text-[12px] text-muted mt-1">
            {processed
              ? item.status === 'arquivado'
                ? 'arquivado'
                : `${(item.convertedTo && CONVERTED_LABEL[item.convertedTo.type]) ?? 'processado'} ✓`
              : relativeDay(toDateKey(new Date(item.createdAt)), today)}
          </span>
          )}
        </span>
      </button>
    </SwipeRow>
  )
}

function Group({ title, items, today, index }: { title: string; items: BrainDumpItem[]; today: string; index: number }) {
  const [open, setOpen] = useState(true)
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + index * 0.05 }} className="mt-6">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center justify-between px-1 h-9">
        <span className="eyebrow">
          {title} <span className="normal-case tracking-normal font-normal text-muted/80 ml-1">{items.length}</span>
        </span>
        <ChevronDown size={16} className={cn('text-muted transition-transform', !open && '-rotate-90')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="card overflow-hidden divide-y divide-line/70 mt-1">
              {items.map((it) => (
                <ItemRow key={it.id} item={it} today={today} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

function NotesList({ notes }: { notes: Note[] }) {
  if (!notes.length)
    return (
      <EmptyState
        emoji="💡"
        title="Nenhuma nota ainda"
        text="Ideias soltas, referências, pensamentos. Tudo cabe aqui."
        action={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => openSheet('note', { kind: 'ideia' })}>
            Nova ideia
          </Button>
        }
      />
    )
  return (
    <div className="space-y-2.5 mt-4">
      {notes.map((n, i) => (
        <motion.button
          key={n.id}
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          onClick={() => openSheet('note', { id: n.id })}
          className="card w-full text-left p-4 active:scale-[0.99] transition"
        >
          <div className="flex items-start gap-2">
            <span aria-hidden className="text-[15px] mt-0.5">
              {n.kind === 'ideia' ? '💡' : '📝'}
            </span>
            <div className="flex-1 min-w-0">
              {n.title && <div className="font-display text-[17px] leading-snug">{n.title}</div>}
              <div className={cn('text-[14px] text-ink-2 leading-relaxed line-clamp-3 whitespace-pre-line', n.title && 'mt-0.5')}>{n.body}</div>
              {n.tags.length > 0 && <div className="text-[12px] text-muted mt-1.5">{n.tags.map((t) => `#${t}`).join('  ')}</div>}
            </div>
            {n.pinned && <Pin size={14} className="text-accent shrink-0 mt-1" />}
          </div>
        </motion.button>
      ))}
    </div>
  )
}

export default function InboxPage() {
  const brainDump = useDB((db) => db.brainDump)
  const allNotes = useDB((db) => db.notes)
  const today = useToday()
  const [tab, setTab] = useState<Tab>('inbox')
  const [showProcessed, setShowProcessed] = useState(false)

  const { loose, groups, processed } = useMemo(() => {
    const inbox = brainDump.filter((b) => b.status === 'inbox').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const map = new Map<string, BrainDumpItem[]>()
    for (const it of brainDump) {
      if (it.status !== 'inbox' || !it.group) continue
      map.set(it.group, [...(map.get(it.group) ?? []), it])
    }
    return {
      loose: inbox.filter((b) => !b.group),
      groups: [...map.entries()].sort(([a], [b]) => groupRank(a) - groupRank(b)),
      processed: brainDump.filter((b) => b.status !== 'inbox').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }
  }, [brainDump])

  const notes = useMemo(
    () => [...allNotes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)),
    [allNotes],
  )
  const inboxCount = loose.length + groups.reduce((n, [, items]) => n + items.length, 0)

  return (
    <Page>
      <PageHeader
        back
        title="Inbox"
        subtitle="Tira da cabeça agora. Organiza quando der."
        actions={
          tab === 'notas' ? (
            <Button variant="soft" size="sm" icon={<Plus size={15} />} onClick={() => openSheet('note', { kind: 'nota' })} className="mr-1">
              Nota
            </Button>
          ) : undefined
        }
      />

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'inbox', label: inboxCount ? `Brain dump · ${inboxCount}` : 'Brain dump' },
          { value: 'notas', label: notes.length ? `Notas & ideias · ${notes.length}` : 'Notas & ideias' },
        ]}
      />

      {tab === 'inbox' ? (
        <>
          <div className="mt-4">
            <CaptureBar />
          </div>

          {inboxCount === 0 ? (
            <EmptyState emoji="🫧" title="Nada pedindo tua atenção aqui. Delícia." text="Quando algo surgir, joga aqui em cima." />
          ) : (
            <>
              {loose.length > 0 && <Group title="Soltos" items={loose} today={today} index={0} />}
              {groups.map(([g, items], i) => (
                <Group key={g} title={g} items={items} today={today} index={i + 1} />
              ))}
              <p className="text-center text-[12.5px] text-muted mt-6">toque para organizar · deslize → arquivar · ← apagar</p>
            </>
          )}

          {processed.length > 0 && (
            <section className="mt-8">
              <button type="button" onClick={() => setShowProcessed((v) => !v)} aria-expanded={showProcessed} className="flex items-center gap-1.5 px-1 h-10 eyebrow">
                processados · {processed.length}
                <ChevronDown size={14} className={cn('transition-transform', showProcessed && 'rotate-180')} />
              </button>
              {showProcessed && (
                <div className="card overflow-hidden divide-y divide-line/70 mt-1">
                  {processed.map((it) => (
                    <ItemRow key={it.id} item={it} today={today} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <NotesList notes={notes} />
      )}
    </Page>
  )
}
