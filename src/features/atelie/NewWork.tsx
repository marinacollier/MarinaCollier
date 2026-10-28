/** "Escrever": start a new piece from texto livre, fragmento, imagem/objeto, experiência, tema, exercício — or continue a draft. */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { Button, Chip, Field, Select, TextArea, TextInput } from '@/components/ui'
import { persist, useDB } from '@/data/store'
import type { LiteraryOrigin } from '@/data/types'
import { cn } from '@/lib/cn'
import { EXERCISES, exerciseById } from './exercises'
import { lastEdited, ORIGIN_LABEL, workDateLabel } from './model'
import { createWork, saveVersion } from './ops'
import { SERIF } from './parts'

type Start = Exclude<LiteraryOrigin, 'acervo'> | 'continuar'

const STARTS: { id: Start; hint: string }[] = [
  { id: 'livre', hint: 'página em branco' },
  { id: 'fragmento', hint: 'uma frase que apareceu' },
  { id: 'imagem', hint: 'algo que você viu ou tocou' },
  { id: 'experiencia', hint: 'algo que aconteceu' },
  { id: 'tema', hint: 'uma ideia para explorar' },
  { id: 'exercicio', hint: 'do Laboratório' },
  { id: 'continuar', hint: 'um rascunho seu' },
]

const SEED_LABEL: Partial<Record<Start, string>> = {
  fragmento: 'O fragmento (vira o começo do texto)',
  imagem: 'A imagem ou o objeto',
  experiencia: 'O que aconteceu (contexto de criação)',
  tema: 'Temas (separados por vírgula)',
}

export function NewWork({ onClose, initialExercise }: { onClose: () => void; initialExercise?: string }) {
  const nav = useNavigate()
  const works = useDB((db) => db.literaryWorks)
  const versions = useDB((db) => db.literaryVersions)
  const [start, setStart] = useState<Start>(initialExercise ? 'exercicio' : 'livre')
  const [title, setTitle] = useState('')
  const [seed, setSeed] = useState('')
  const [exercise, setExercise] = useState<string | undefined>(initialExercise)
  const drafts = useMemo(
    () => works.filter((w) => w.status === 'rascunho' || w.status === 'ideia' || w.status === 'lapidacao').sort((a, b) => lastEdited({ literaryVersions: versions }, b).localeCompare(lastEdited({ literaryVersions: versions }, a))),
    [works, versions],
  )

  const create = () => {
    if (start === 'continuar') return
    const ex = exerciseById(exercise)
    const s = seed.trim()
    const w = createWork({
      title: title.trim() || (start === 'exercicio' && ex ? ex.title : 'Sem título'),
      status: start === 'tema' || start === 'imagem' ? 'ideia' : 'rascunho',
      origin: start,
      ...(start === 'exercicio' && ex ? { exerciseId: ex.id } : {}),
      ...(start === 'imagem' && s ? { centralImage: s } : {}),
      ...(start === 'experiencia' && s ? { creationContext: s } : {}),
      ...(start === 'tema' && s ? { themes: s.split(/[,;]/).map((t) => t.trim()).filter(Boolean) } : {}),
    })
    // A fragment is her own text: it becomes the first version.
    if (start === 'fragmento' && s) saveVersion(w.id, s, 'Fragmento inicial')
    void persist()
    onClose()
    nav(ROUTES.atelieWork(w.id) + '?novo=1')
  }

  return (
    <div className="card p-4 mt-3" aria-label="Começar a escrever">
      <div className="flex items-center justify-between">
        <div className="eyebrow">Começar por</div>
        <button type="button" className="text-[13px] text-muted h-9 px-1" onClick={onClose}>
          fechar
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {STARTS.map((s) => (
          <Chip key={s.id} selected={start === s.id} onClick={() => setStart(s.id)}>
            {s.id === 'continuar' ? 'Continuar rascunho' : ORIGIN_LABEL[s.id]}
          </Chip>
        ))}
      </div>
      <p className="text-[12.5px] text-muted mt-2">{STARTS.find((s) => s.id === start)?.hint}</p>

      {start === 'continuar' ? (
        <div className="mt-3 divide-y divide-line/70">
          {drafts.length === 0 && <p className="text-[14px] text-muted py-2">Nenhum rascunho por enquanto.</p>}
          {drafts.slice(0, 8).map((w) => (
            <button key={w.id} type="button" className="w-full text-left py-2.5 flex items-baseline justify-between gap-3" onClick={() => nav(ROUTES.atelieWork(w.id))}>
              <span className="font-display text-[17px] truncate">{w.title}</span>
              <span className="text-[12px] text-muted shrink-0">{workDateLabel(w)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3 mt-3">
          {start === 'exercicio' && (
            <Field label="Exercício">
              <Select value={exercise} onChange={setExercise} placeholder="Escolha um exercício" options={EXERCISES.map((e) => ({ value: e.id, label: e.title }))} />
              {exerciseById(exercise) && <p className="text-[13px] text-ink-2 mt-2 leading-snug">{exerciseById(exercise)!.prompt}</p>}
            </Field>
          )}
          <Field label="Título (pode ficar para depois)">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sem título" aria-label="Título" style={SERIF} />
          </Field>
          {SEED_LABEL[start] &&
            (start === 'fragmento' || start === 'experiencia' ? (
              <Field label={SEED_LABEL[start]}>
                <TextArea value={seed} onChange={(e) => setSeed(e.target.value)} rows={3} aria-label={SEED_LABEL[start]} style={start === 'fragmento' ? SERIF : undefined} />
              </Field>
            ) : (
              <Field label={SEED_LABEL[start]}>
                <TextInput value={seed} onChange={(e) => setSeed(e.target.value)} aria-label={SEED_LABEL[start]} />
              </Field>
            ))}
          <Button variant="primary" block className={cn(start === 'exercicio' && !exercise && 'opacity-40')} disabled={start === 'exercicio' && !exercise} onClick={create}>
            Abrir a página
          </Button>
        </div>
      )}
    </div>
  )
}
