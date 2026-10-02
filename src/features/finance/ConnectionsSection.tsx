import { useNavigate } from 'react-router-dom'
import { ChevronRight, CreditCard, Landmark, Wallet } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import type { FinancialAccount, IntegrationConnection } from '@/data/types'
import { Card, Pill, SectionTitle } from '@/components/ui'
import { formatBRL } from '@/lib/money'
import { cn } from '@/lib/cn'
import { organizzeState } from './selectors'

const KIND_LABEL: Record<FinancialAccount['kind'], string> = {
  conta: 'conta',
  cartao: 'cartão',
  investimento: 'investimento',
  outro: 'outro',
}

function formatSync(iso?: string): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function ConnectionsSection({
  accounts,
  integrations,
  organizzeEnabled,
}: {
  accounts: FinancialAccount[]
  integrations: IntegrationConnection[]
  organizzeEnabled: boolean
}) {
  const nav = useNavigate()
  const { state, conn } = organizzeState(integrations, organizzeEnabled)
  const visible = accounts.filter((a) => !a.archived)

  const copy: Record<typeof state, { title: string; text: string; pill: string; tone: string }> = {
    connected: {
      title: 'Organizze conectado',
      text: formatSync(conn?.lastSyncAt) ? `última sincronização: ${formatSync(conn?.lastSyncAt)}` : 'sincronizando seus lançamentos',
      pill: 'ativo',
      tone: 'bg-sage-soft text-sage',
    },
    error: {
      title: 'Organizze precisa de atenção',
      text: 'A sincronização não rolou da última vez. Seus gastos manuais seguem normais.',
      pill: 'ver',
      tone: 'bg-sand-soft text-sand',
    },
    needs_setup: {
      title: 'Organizze: configuração necessária',
      text: 'Falta um passo pra conectar. Enquanto isso, seus gastos manuais funcionam normalmente.',
      pill: 'configurar',
      tone: 'bg-surface-2 text-ink-2',
    },
    coming_soon: {
      title: 'Organizze em breve',
      text: 'A conexão está chegando. Seus gastos manuais funcionam normalmente.',
      pill: 'em breve',
      tone: 'bg-surface-2 text-ink-2',
    },
    off: {
      title: 'Organizze ainda não conectado',
      text: 'Seus gastos manuais funcionam normalmente. Toque pra ver as integrações.',
      pill: 'integrações',
      tone: 'bg-surface-2 text-ink-2',
    },
  }
  const c = copy[state]

  return (
    <>
      {visible.length > 0 && (
        <>
          <SectionTitle>Contas e cartões</SectionTitle>
          <div className="card overflow-hidden divide-y divide-line/70">
            {visible.map((a) => (
              <div key={a.id} className="flex items-center gap-3 min-h-[52px] py-2.5 px-4">
                <span className="h-8 w-8 rounded-full bg-surface-2 text-ink-2 flex items-center justify-center shrink-0">
                  {a.kind === 'cartao' ? <CreditCard size={16} /> : a.kind === 'conta' ? <Landmark size={16} /> : <Wallet size={16} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] truncate">{a.name}</div>
                  <div className="text-[12.5px] text-muted">
                    {KIND_LABEL[a.kind]}
                    {a.dueDay ? ` · vence dia ${a.dueDay}` : ''}
                    {a.external ? ' · Organizze' : ''}
                  </div>
                </div>
                {a.balanceCents != null && <span className="font-display text-[15px] tabular-nums">{formatBRL(a.balanceCents)}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Conexões</SectionTitle>
      <Card onPress={() => nav(ROUTES.integrations)} className="flex items-center gap-3">
        <span className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center text-[18px] shrink-0" aria-hidden>
          🔗
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium leading-snug">{c.title}</div>
          <div className="text-[13px] text-muted mt-0.5">{c.text}</div>
        </div>
        {state !== 'off' && <Pill className={cn('shrink-0', c.tone)}>{c.pill}</Pill>}
        <ChevronRight size={18} className="text-muted/60 shrink-0" />
      </Card>
    </>
  )
}
