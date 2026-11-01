/** Cuidar de Mim — peças compartilhadas (cartão de técnica, copiar de verdade). */
import { useState } from 'react'
import { ChevronDown, Star } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { Card, Pill } from '@/components/ui'
import { useDB } from '@/data/store'
import type { CarePreference } from '@/data/types'
import { cn } from '@/lib/cn'
import { prefId, registerUse, setPreference, toggleFavorite } from './ops'
import type { Technique } from './techniques'

/** Copia com a API real. true só quando o sistema confirmou. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function copyWithFeedback(text: string, ok = 'Copiado. Agora é só colar — você envia.'): Promise<boolean> {
  return copyText(text).then((done) => {
    toast(done ? ok : 'Não consegui copiar. Selecione o texto e copie manualmente.')
    return done
  })
}

const PREFS: CarePreference[] = ['ajuda', 'às vezes', 'não pra mim']

export function TechniqueCard({ t, defaultOpen = false }: { t: Technique; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const pref = useDB((db) => (db.careTechniquePrefs ?? []).find((p) => p.id === prefId(t.id)))
  const uses = pref?.usedAt.length ?? 0

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-[16px] font-semibold leading-snug">{t.name}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[12px]">
            <Pill>{t.approach}</Pill>
            <Pill>{t.duration}</Pill>
          </div>
        </div>
        <button
          type="button"
          aria-pressed={!!pref?.favorite}
          aria-label={pref?.favorite ? 'Tirar das favoritas' : 'Favoritar'}
          onClick={() => toggleFavorite(t.id)}
          className="h-10 w-10 -mr-1 inline-flex items-center justify-center rounded-full active:bg-surface-2"
        >
          <Star size={20} className={pref?.favorite ? 'fill-accent text-accent' : 'text-muted'} />
        </button>
      </div>

      <p className="text-[15px] leading-relaxed">{t.shortVersion}</p>

      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-[13.5px] text-ink-2 h-9">
        {open ? 'Fechar passo a passo' : 'Ver passo a passo'}
        <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-3 text-[14px] leading-relaxed">
          <p>
            <span className="text-muted">Para que serve: </span>
            {t.purpose}
          </p>
          <ol className="list-decimal pl-5 space-y-1.5">
            {t.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p>
            <span className="text-muted">Quando ajuda: </span>
            {t.whenHelps}
          </p>
          <p>
            <span className="text-muted">Quando evitar ou adaptar: </span>
            {t.whenAvoidOrAdapt}
          </p>
          <p className="text-[12.5px] text-muted">Fonte: {t.source}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Como essa técnica funciona para você">
        {PREFS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={pref?.preference === p}
            onClick={() => setPreference(t.id, p)}
            className={cn('h-8 px-3 rounded-full text-[12.5px]', pref?.preference === p ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const undo = registerUse(t.id)
            toast('Anotado que você usou.', { action: { label: 'Desfazer', run: undo } })
          }}
          className="h-8 px-3 rounded-full text-[12.5px] border border-line text-ink-2 ml-auto"
        >
          registrar que usei{uses ? ` · ${uses}` : ''}
        </button>
      </div>
    </Card>
  )
}
