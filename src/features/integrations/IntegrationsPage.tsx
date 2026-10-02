import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, CalendarSync, FileText, Mail, MessagesSquare, RefreshCw, ShieldCheck, Smartphone, Wallet } from 'lucide-react'
import { Button, Page, PageHeader, SectionTitle } from '@/components/ui'
import { toast } from '@/app/ui-store'
import { actions, useDB } from '@/data/store'
import type { FeatureFlags, IntegrationConnection, ProviderId } from '@/data/types'
import { haptic } from '@/lib/haptics'
import { formatShortDate, toDateKey, toTimeHM } from '@/lib/date'
import { hasSessionProvider, readBackendEnv } from '@/integrations/backend'
import { googleCalendar } from '@/integrations/google'
import { microsoftCalendar } from '@/integrations/microsoft'
import { outlookMail } from '@/integrations/outlook'
import { PROVIDER_ORDER, PROVIDERS, providerStatus } from '@/integrations/registry'
import { parseOAuthReturn, refreshConnections, setConnection, syncProvider } from '@/integrations/run'
import { teamsMentions } from '@/integrations/teams'
import type { ProviderInfo, ProviderStatus } from '@/integrations/types'
import { IcsTools, reportMessage } from './IcsTools'
import { InfoBox, ProviderCard } from './ProviderCard'

type Pid = (typeof PROVIDER_ORDER)[number]

const ICONS: Record<Pid, ReactNode> = {
  ics: <FileText size={20} />,
  google: <CalendarDays size={20} />,
  toki: <CalendarSync size={20} />,
  microsoft: <CalendarDays size={20} />,
  outlook: <Mail size={20} />,
  teams: <MessagesSquare size={20} />,
  organizze: <Wallet size={20} />,
  apple: <Smartphone size={20} />,
}

const GROUPS: { id: ProviderInfo['group']; title: string }[] = [
  { id: 'calendarios', title: 'Calendários' },
  { id: 'trabalho', title: 'Trabalho' },
  { id: 'financas', title: 'Finanças' },
  { id: 'apple', title: 'Apple' },
]

const CONNECT: Partial<Record<ProviderId, () => Promise<void>>> = {
  google: () => googleCalendar.connect!(),
  microsoft: () => microsoftCalendar.connect!(),
  outlook: () => outlookMail.connect!(),
  teams: () => teamsMentions.connect!(),
}

const SECRETS: Partial<Record<ProviderId, string>> = {
  google: 'GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET',
  microsoft: 'MS_CLIENT_ID, MS_CLIENT_SECRET e MS_TENANT',
  outlook: 'MS_CLIENT_ID, MS_CLIENT_SECRET e MS_TENANT',
  teams: 'MS_CLIENT_ID, MS_CLIENT_SECRET e MS_TENANT',
  organizze: 'ORGANIZZE_EMAIL e ORGANIZZE_API_TOKEN (token em app.organizze.com.br/configuracoes/api-keys)',
}

function ConfigSteps({ provider, signedInMissing }: { provider: ProviderId; signedInMissing: boolean }) {
  return (
    <InfoBox title="Configuração necessária">
      {signedInMissing ? (
        <p>O servidor já está apontado, mas falta o login do MARINA OS (Supabase Auth) para o servidor saber que é você. Assim que ele existir, o botão Conectar aparece aqui.</p>
      ) : (
        <ol className="list-decimal pl-4 space-y-1">
          <li>Crie um projeto no Supabase e rode a migração <code className="font-mono text-[12px]">0001_integrations.sql</code>.</li>
          <li>Publique as Edge Functions da pasta <code className="font-mono text-[12px]">supabase/functions</code>.</li>
          <li>Cadastre os segredos {SECRETS[provider]}, além de TOKEN_ENCRYPTION_KEY e APP_ORIGIN.</li>
          <li>
            Defina <code className="font-mono text-[12px]">VITE_MARINA_API_URL</code> no build do app.
          </li>
        </ol>
      )}
      <p className="mt-2 text-muted">Passo a passo completo em docs/INTEGRATIONS.md. Sem pressa — o resto do app funciona igual.</p>
    </InfoBox>
  )
}

function lastSyncLabel(iso?: string): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return `Última sincronização: ${formatShortDate(toDateKey(d))}, ${toTimeHM(d)}`
}

export default function IntegrationsPage() {
  const flags = useDB((db) => db.profile.featureFlags)
  const connections = useDB((db) => db.integrations)
  const env = useMemo(() => readBackendEnv(), [])
  const signedIn = hasSessionProvider()
  const backendReady = !!env.apiUrl && signedIn
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<ProviderId | null>(null)

  // Back from an OAuth redirect: ?integration=google&status=connected
  useEffect(() => {
    const ret = parseOAuthReturn(location.search)
    if (!ret) return
    setConnection(ret.provider, { status: ret.status })
    const name = PROVIDERS[ret.provider as Pid]?.name ?? ret.provider
    if (ret.status === 'connected') {
      haptic('success')
      toast(`${name} conectado ✨`, { tone: 'win' })
    } else if (ret.status === 'policy_blocked') toast(`${name}: indisponível pela política da organização`)
    else toast(`${name}: não deu certo dessa vez`)
    navigate(location.pathname, { replace: true })
  }, [location.search, location.pathname, navigate])

  useEffect(() => {
    if (backendReady) refreshConnections().catch(() => undefined)
  }, [backendReady])

  const byProvider = useMemo(() => {
    const m = new Map<ProviderId, IntegrationConnection>()
    for (const c of connections) m.set(c.provider, c)
    return m
  }, [connections])

  const statuses = useMemo(() => {
    const out = {} as Record<Pid, ProviderStatus>
    for (const p of PROVIDER_ORDER) out[p] = providerStatus(p, flags, { apiUrl: env.apiUrl, signedIn }, byProvider.get(p))
    return out
  }, [flags, env.apiUrl, signedIn, byProvider])

  function toggle(flag: keyof FeatureFlags, value: boolean) {
    actions.setProfile({ featureFlags: { ...flags, [flag]: value } })
  }

  async function connect(p: ProviderId) {
    setBusy(p)
    try {
      await CONNECT[p]!()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não consegui iniciar a conexão')
      setBusy(null)
    }
  }

  async function sync(p: ProviderId) {
    setBusy(p)
    try {
      const r = await syncProvider(p)
      haptic('success')
      toast(reportMessage(r))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não deu para sincronizar agora')
    } finally {
      setBusy(null)
    }
  }

  function body(p: Pid): ReactNode {
    const info = PROVIDERS[p]
    const s = statuses[p]
    const conn = byProvider.get(p)

    if (p === 'ics') return flags.icsEnabled ? <IcsTools backendReady={backendReady} /> : null

    if (p === 'toki') {
      return (
        <InfoBox tone="ocean" title="Como evitamos duplicados">
          <p>Toki → grava no Google, Outlook ou iCloud → o MARINA OS lê essas agendas.</p>
          <p className="mt-1">Cada evento tem um iCalUID. Se a mesma reunião chegar por duas fontes, ela aparece uma vez só. Nada é criado em dobro.</p>
        </InfoBox>
      )
    }

    if (p === 'apple') {
      return (
        <InfoBox tone="ocean" title="Enquanto isso">
          <ul className="space-y-1">
            <li>• Calendário do iCloud: exporte como .ics e importe no card “Arquivo .ics”.</li>
            <li>• Atalhos (Shortcuts): a ação “Abrir URLs” pode abrir o MARINA OS direto numa tela.</li>
            <li>• Saúde e Lembretes ficam para um app nativo, no futuro.</li>
          </ul>
        </InfoBox>
      )
    }

    const extra: ReactNode[] = []
    if (p === 'outlook') {
      extra.push(
        <p key="ro" className="text-[13px] text-muted">
          No Work Inbox aparecem só assunto, remetente, data e o link para abrir no Outlook. Você decide o que vira tarefa.
        </p>,
      )
    }

    switch (s.status) {
      case 'needs_config':
        return info.flag && flags[info.flag] ? (
          <div className="space-y-3">
            {extra}
            <ConfigSteps provider={p} signedInMissing={!!env.apiUrl && !signedIn} />
          </div>
        ) : (
          extra[0] ?? null
        )
      case 'needs_auth':
        return (
          <div className="space-y-3">
            {extra}
            {CONNECT[p] ? (
              <Button block onClick={() => connect(p)} disabled={busy === p}>
                Conectar
              </Button>
            ) : (
              <InfoBox title="Falta o token no servidor">Cadastre {SECRETS[p]} nos segredos das Edge Functions.</InfoBox>
            )}
          </div>
        )
      case 'connected':
        return (
          <div className="space-y-2">
            {extra}
            {conn?.lastSyncAt && <p className="text-[13px] text-muted">{lastSyncLabel(conn.lastSyncAt)}</p>}
            <Button variant="soft" block icon={<RefreshCw size={16} className={busy === p ? 'animate-spin' : ''} />} onClick={() => sync(p)} disabled={busy === p}>
              Sincronizar agora
            </Button>
          </div>
        )
      case 'policy_blocked':
        return (
          <InfoBox tone="plum" title="Indisponível pela política da organização">
            A empresa não permite que apps de fora acessem esses dados sem aprovação do admin. Dá para pedir ao TI para aprovar o app — ou seguir sem essa integração, tudo bem.
          </InfoBox>
        )
      case 'error':
        return (
          <div className="space-y-2">
            <InfoBox tone="accent">{s.message}</InfoBox>
            <Button variant="soft" block icon={<RefreshCw size={16} />} onClick={() => sync(p)} disabled={busy === p}>
              Tentar de novo
            </Button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Page>
      <PageHeader back backTo="/ajustes" search={false} title="Integrações" subtitle="Conecte só o que facilita. O resto continua funcionando offline." />

      <div className="card p-4 flex gap-3 items-start">
        <div className="h-10 w-10 rounded-2xl bg-sage-soft text-sage flex items-center justify-center shrink-0" aria-hidden>
          <ShieldCheck size={20} />
        </div>
        <div className="text-[14px] text-ink-2 leading-relaxed">
          <div className="font-medium text-ink">Seus dados, do seu jeito</div>
          Senhas e tokens nunca ficam no aparelho. Trabalho entra só como resumo e link — nunca o e-mail inteiro. E nada é enviado, apagado ou movido.
        </div>
      </div>

      {GROUPS.map((g) => (
        <div key={g.id}>
          <SectionTitle>{g.title}</SectionTitle>
          <div className="space-y-3">
            {PROVIDER_ORDER.filter((p) => PROVIDERS[p].group === g.id).map((p) => {
              const info = PROVIDERS[p]
              return (
                <ProviderCard
                  key={p}
                  info={info}
                  status={statuses[p]}
                  icon={ICONS[p]}
                  flagOn={info.flag ? flags[info.flag] : undefined}
                  onToggleFlag={info.flag ? (v) => toggle(info.flag!, v) : undefined}
                  accountLabel={statuses[p].status === 'connected' && p !== 'ics' ? byProvider.get(p)?.accountLabel : undefined}
                >
                  {body(p)}
                </ProviderCard>
              )
            })}
          </div>
        </div>
      ))}
    </Page>
  )
}
