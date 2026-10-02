import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, ExternalLink, Lock } from 'lucide-react'
import type { IntegrationStatus, ProviderId } from '@/data/types'
import { cn } from '@/lib/cn'
import { statusLabel } from '@/integrations/registry'
import type { ProviderInfo, ProviderStatus } from '@/integrations/types'
import { Switch } from './Switch'

const PILL: Record<IntegrationStatus | 'offline', string> = {
  connected: 'bg-sage-soft text-sage',
  offline: 'bg-ocean-soft text-ocean',
  needs_config: 'bg-sand-soft text-sand',
  needs_auth: 'bg-accent-soft text-accent',
  coming_soon: 'bg-surface-2 text-ink-2',
  policy_blocked: 'bg-plum-soft text-plum',
  error: 'bg-accent-soft text-accent',
}

export function StatusPill({ provider, status }: { provider: ProviderId; status: ProviderStatus }) {
  const key = provider === 'ics' ? 'offline' : status.status
  return (
    <span className={cn('inline-flex items-center gap-1.5 min-h-6 px-2.5 py-0.5 rounded-full text-[12px] font-medium leading-tight', PILL[key])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" aria-hidden />
      {statusLabel(provider, status)}
    </span>
  )
}

export interface ProviderCardProps {
  info: ProviderInfo
  status: ProviderStatus
  icon: ReactNode
  flagOn?: boolean
  onToggleFlag?: (v: boolean) => void
  /** Status-specific area (config steps, connect button, tools...). */
  children?: ReactNode
  accountLabel?: string
}

export function ProviderCard({ info, status, icon, flagOn, onToggleFlag, children, accountLabel }: ProviderCardProps) {
  const [open, setOpen] = useState(false)
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="card p-4">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-2xl bg-surface-2 text-ink-2 flex items-center justify-center shrink-0" aria-hidden>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-[19px] leading-tight">{info.name}</h3>
          <div className="mt-1.5">
            <StatusPill provider={info.id} status={status} />
          </div>
          {accountLabel && <div className="text-[13px] text-muted mt-1 truncate">{accountLabel}</div>}
        </div>
        {onToggleFlag && <Switch checked={!!flagOn} onChange={onToggleFlag} label={`Ativar ${info.name}`} />}
      </div>

      <p className="text-[14.5px] text-ink-2 leading-relaxed mt-3">{info.description}</p>

      {info.guarantees && info.guarantees.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {info.guarantees.map((g) => (
            <li key={g} className="inline-flex items-center gap-1 text-[12.5px] text-sage bg-sage-soft rounded-full px-2.5 py-1">
              <Check size={13} strokeWidth={2.5} aria-hidden />
              {g}
            </li>
          ))}
        </ul>
      )}

      {children && <div className="mt-4">{children}</div>}

      <div className="mt-3 -mx-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 h-11 px-1 text-[13.5px] text-muted active:text-ink whitespace-nowrap"
        >
          <Lock size={14} aria-hidden />
          Privacidade
          <ChevronDown size={15} className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {info.docsUrl && (
          <a href={info.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-11 px-1 text-[13.5px] text-ocean whitespace-nowrap">
            Ver documentação oficial
            <ExternalLink size={13} aria-hidden />
          </a>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="rounded-2xl bg-surface-2 p-3.5 text-[13.5px] space-y-3">
              <div>
                <div className="eyebrow mb-1">Guardamos</div>
                <ul className="space-y-0.5 text-ink-2">
                  {info.stores.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="eyebrow mb-1">Permissões pedidas</div>
                <ul className="flex flex-wrap gap-1.5">
                  {info.permissions.map((p) => (
                    <li key={p} className="font-mono text-[11.5px] bg-surface text-ink-2 rounded-lg px-2 py-1 break-all">
                      {p.replace('https://www.googleapis.com/auth/', '')}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

/** Soft information box used for config steps / explanations. */
export function InfoBox({ tone = 'sand', title, children }: { tone?: 'sand' | 'plum' | 'ocean' | 'accent'; title?: ReactNode; children: ReactNode }) {
  const bg = { sand: 'bg-sand-soft', plum: 'bg-plum-soft', ocean: 'bg-ocean-soft', accent: 'bg-accent-soft' }[tone]
  return (
    <div className={cn('rounded-2xl p-3.5 text-[13.5px] text-ink-2 leading-relaxed', bg)}>
      {title && <div className="font-medium text-ink mb-1">{title}</div>}
      {children}
    </div>
  )
}
