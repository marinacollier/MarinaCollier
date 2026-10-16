/**
 * "Copiar contexto para ChatGPT": she picks the modules, sees what goes (counts + fields), sensitive fields
 * stay out unless she turns them on. Copies marina-os/context@1 (with the instructions inside), or only the
 * instructions. The answer comes back through the Central de importação.
 */
import { useMemo, useState } from 'react'
import { Copy, FileText } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { Button, Card, Checkbox } from '@/components/ui'
import { lockNow } from '@/data/changes/apply'
import { buildContext, chatgptInstructions, CONTEXT_MODULES, SENSITIVE, type ContextModule, type SensitiveKind } from '@/data/changes/context'
import { useDB } from '@/data/store'
import { useLockState } from '@/app/lock-store'
import { copyText } from '@/lib/clipboard'
import { haptic } from '@/lib/haptics'
import { Toggle } from './components'

export function ContextExport() {
  const db = useDB()
  const lock = useLockState()
  const [modules, setModules] = useState<ContextModule[]>(CONTEXT_MODULES.filter((m) => m.on).map((m) => m.id))
  const [include, setInclude] = useState<SensitiveKind[]>([])
  const [show, setShow] = useState(false)
  const isLocked = useMemo(() => lockNow(), [db.profile.privacyLock, lock]) // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => buildContext(db, { modules, include, isLocked }), [db, modules, include, isLocked])

  const copy = async (text: string, what: string) => {
    if (await copyText(text)) {
      haptic('success')
      toast(`${what} copiado ✓ cola no ChatGPT`)
    } else toast('Não consegui copiar — tenta de novo?')
  }
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <Card className="space-y-3">
      <p className="text-[14px] text-ink-2 leading-snug">Escolhe o que o ChatGPT pode ver. Ele responde com um JSON de mudanças que você cola na Central acima.</p>
      <ul className="space-y-0.5">
        {CONTEXT_MODULES.map((m) => {
          const locked = !!m.lock && isLocked(m.lock)
          const on = modules.includes(m.id)
          return (
            <li key={m.id} className="flex items-center gap-3 min-h-11">
              <Checkbox checked={on && !locked} onChange={() => !locked && setModules((x) => toggle(x, m.id))} label={m.label} size="sm" className="ml-0.5" />
              <span className={locked ? 'text-[14px] text-muted' : 'text-[14px]'}>{m.label}</span>
              <span className="ml-auto text-[12.5px] tabular-nums text-muted">{locked ? 'trancado' : on ? (ctx.counts[m.id] ?? 0) : ''}</span>
            </li>
          )
        })}
      </ul>
      <div>
        <div className="text-[12px] uppercase tracking-wide text-muted">Dados sensíveis (fora por padrão)</div>
        <ul className="mt-1">
          {SENSITIVE.map((s) => (
            <li key={s.id} className="flex items-center gap-3 min-h-11">
              <span className="flex-1 text-[14px]">{s.label}</span>
              <Toggle checked={include.includes(s.id)} onChange={() => setInclude((x) => toggle(x, s.id))} label={`Incluir ${s.label}`} />
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={() => setShow((v) => !v)} className="text-[13px] text-ink-2 underline underline-offset-2">
        {show ? 'Esconder o que vai' : `Ver o que vai pro ChatGPT (${(ctx.text.length / 1024).toFixed(1)} KB)`}
      </button>
      {show && <pre className="max-h-64 overflow-auto rounded-2xl bg-surface-2 p-3 text-[11px] leading-snug whitespace-pre-wrap break-all">{ctx.text.slice(0, 6000)}{ctx.text.length > 6000 ? '\n…' : ''}</pre>}
      <div className="grid grid-cols-1 gap-2">
        <Button variant="primary" icon={<Copy size={16} />} onClick={() => void copy(ctx.text, 'Contexto')} disabled={!modules.length}>
          Copiar contexto para ChatGPT
        </Button>
        <Button variant="soft" icon={<FileText size={16} />} onClick={() => void copy(chatgptInstructions(), 'Instruções')}>
          Copiar só as instruções
        </Button>
      </div>
    </Card>
  )
}
