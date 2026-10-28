/** Coleções: criar, renomear, descrever, incluir/retirar obras e ordenar. Apagar uma coleção nunca apaga obras. */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { Button, Card, EmptyState, IconButton, Select, TextArea, TextInput } from '@/components/ui'
import { actions, persist, useDB } from '@/data/store'
import type { LiteraryCollection } from '@/data/types'
import { createCollection, moveInCollection, removeCollection, setInCollection } from '../ops'
import { parseTags } from '../model'
import { ConfirmInline, Tags } from '../parts'

export function Collections() {
  const cols = useDB((db) => db.literaryCollections)
  const [name, setName] = useState('')
  const [open, setOpen] = useState<string>()

  const add = () => {
    if (!name.trim()) return
    const c = createCollection(name)
    setName('')
    setOpen(c.id)
    void persist()
  }

  return (
    <div>
      <p className="text-[13.5px] text-muted leading-snug">Coleções temáticas e projetos editoriais. Uma obra pode estar em mais de uma — ou em nenhuma.</p>
      <div className="space-y-3 mt-3">
        {cols.map((c) => (
          <CollectionCard key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? undefined : c.id)} />
        ))}
      </div>
      {cols.length === 0 && <EmptyState emoji="📚" title="Nenhuma coleção ainda" compact />}
      <form
        className="flex gap-2 mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova coleção" aria-label="Nome da nova coleção" />
        <Button type="submit" variant="soft" disabled={!name.trim()}>
          Criar
        </Button>
      </form>
      <p className="text-[12.5px] text-muted mt-4">Projeto de livro (seleção, ordem, seções, sumário): em breve.</p>
    </div>
  )
}

function CollectionCard({ c, open, onToggle }: { c: LiteraryCollection; open: boolean; onToggle: () => void }) {
  const nav = useNavigate()
  const works = useDB((db) => db.literaryWorks)
  const [confirm, setConfirm] = useState(false)
  const [add, setAdd] = useState<string>()
  const inside = c.workIds.map((id) => works.find((w) => w.id === id)).filter((w) => !!w)
  const outside = works.filter((w) => !c.workIds.includes(w.id))
  const save = (patch: Partial<LiteraryCollection>) => {
    actions.update('literaryCollections', c.id, patch)
    void persist()
  }

  return (
    <Card>
      <button type="button" className="w-full text-left" onClick={onToggle} aria-expanded={open}>
        <div className="font-display text-[21px] leading-tight">{c.name}</div>
        {c.description && <p className="text-[13.5px] text-ink-2 mt-1 leading-snug">{c.description}</p>}
        <div className="text-[12px] text-muted mt-1.5">{inside.length ? `${inside.length} ${inside.length === 1 ? 'obra' : 'obras'}` : 'nenhuma obra ainda — você escolhe'}</div>
      </button>
      {!open && <Tags tags={c.themes} max={5} className="mt-2" />}
      {open && (
        <div className="mt-3 space-y-3">
          <TextInput aria-label="Nome da coleção" defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && save({ name: e.target.value.trim() })} />
          <TextArea aria-label="Descrição" placeholder="Descrição" defaultValue={c.description ?? ''} rows={2} onBlur={(e) => e.target.value.trim() !== (c.description ?? '') && save({ description: e.target.value.trim() || undefined })} />
          <TextInput aria-label="Temas da coleção" placeholder="Temas (separados por vírgula)" defaultValue={c.themes.join(', ')} onBlur={(e) => save({ themes: parseTags(e.target.value) })} />

          <div>
            <div className="eyebrow mb-1">Obras, na ordem</div>
            {inside.length === 0 && <p className="text-[13px] text-muted">Nenhuma obra nesta coleção.</p>}
            <ol className="divide-y divide-line/70">
              {inside.map((w, i) => (
                <li key={w.id} className="flex items-center gap-1 py-1">
                  <span className="text-[12px] text-muted w-5 shrink-0">{i + 1}</span>
                  <button type="button" className="font-display text-[16px] flex-1 min-w-0 truncate text-left h-10" onClick={() => nav(ROUTES.atelieWork(w.id))}>
                    {w.title}
                  </button>
                  <IconButton size="sm" label={`Subir ${w.title}`} disabled={i === 0} onClick={() => {
                      moveInCollection(c.id, w.id, -1)
                      void persist()
                    }}>
                    <ArrowUp size={16} />
                  </IconButton>
                  <IconButton size="sm" label={`Descer ${w.title}`} disabled={i === inside.length - 1} onClick={() => {
                      moveInCollection(c.id, w.id, 1)
                      void persist()
                    }}>
                    <ArrowDown size={16} />
                  </IconButton>
                  <IconButton size="sm" label={`Tirar ${w.title} da coleção`} onClick={() => {
                      setInCollection(c.id, w.id, false)
                      void persist()
                    }}>
                    <X size={16} />
                  </IconButton>
                </li>
              ))}
            </ol>
          </div>

          {outside.length > 0 && (
            <div className="flex gap-2">
              <Select className="flex-1" value={add} onChange={setAdd} placeholder="Adicionar obra…" options={outside.map((w) => ({ value: w.id, label: w.title }))} />
              <Button
                variant="soft"
                disabled={!add}
                onClick={() => {
                  if (!add) return
                  setInCollection(c.id, add, true)
                  setAdd(undefined)
                  void persist()
                }}
              >
                Adicionar
              </Button>
            </div>
          )}

          {!confirm ? (
            <button type="button" className="text-[13px] text-muted h-9" onClick={() => setConfirm(true)}>
              Apagar coleção
            </button>
          ) : (
            <ConfirmInline
              tone="danger"
              text="Apagar esta coleção? As obras continuam no acervo."
              confirmLabel="Apagar coleção"
              onCancel={() => setConfirm(false)}
              onConfirm={() => {
                removeCollection(c.id)
                void persist()
                toast('Coleção apagada — as obras continuam no acervo.')
              }}
            />
          )}
        </div>
      )}
    </Card>
  )
}
