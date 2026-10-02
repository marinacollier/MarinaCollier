import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, Info } from 'lucide-react'
import { Button, Card, Chip, ListCard, Page, PageHeader, Pill, SectionTitle } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { NotificationCategory, NotificationPref } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { cn } from '@/lib/cn'
import { DEFAULT_LEAD, NOTIFICATION_META, NOTIFICATION_ORDER } from './notifications'
import { isIOS, isStandalone, notificationPermission, type PermissionState } from './platform'
import { showReminder } from './useLocalReminders'
import { EmojiBubble, Hint, Toggle } from './components'

const PERMISSION_LABEL: Record<PermissionState, { label: string; className: string }> = {
  granted: { label: 'Permitidas', className: 'bg-sage-soft text-sage' },
  denied: { label: 'Bloqueadas', className: 'bg-accent-soft text-accent' },
  default: { label: 'Ainda não permitidas', className: 'bg-sand-soft text-sand' },
  unsupported: { label: 'Indisponível aqui', className: 'bg-surface-2 text-muted' },
}

const leadLabel = (m: number) => (m >= 60 ? `${m / 60}h` : `${m} min`)

export default function NotificationsPage() {
  const prefs = useDB((db) => db.profile.notificationPrefs)
  const [permission, setPermission] = useState<PermissionState>(() => notificationPermission())
  const standalone = useMemo(() => isStandalone(), [])
  const ios = useMemo(() => isIOS(), [])

  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && setPermission(notificationPermission())
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const prefFor = (c: NotificationCategory): NotificationPref => prefs.find((p) => p.category === c) ?? { category: c, enabled: false }

  const setPref = (c: NotificationCategory, patch: Partial<NotificationPref>) => {
    const exists = prefs.some((p) => p.category === c)
    actions.setProfile({
      notificationPrefs: exists ? prefs.map((p) => (p.category === c ? { ...p, ...patch } : p)) : [...prefs, { category: c, enabled: false, ...patch }],
    })
  }

  const requestPermission = async () => {
    if (permission === 'unsupported') return
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result === 'granted') toast('Notificações ligadas 🔔')
      else if (result === 'denied') toast('Tudo bem. Dá pra mudar depois nos Ajustes do iPhone.')
    } catch {
      setPermission(notificationPermission())
    }
  }

  const test = async () => {
    const ok = await showReminder({ id: `teste-${Date.now()}`, title: 'Oi, Marina 👋', body: 'É assim que os lembretes vão aparecer.', url: ROUTES.today })
    if (!ok) toast('Não consegui mostrar agora. Tenta com o app instalado.')
  }

  const perm = PERMISSION_LABEL[permission]

  return (
    <Page>
      <PageHeader title="Notificações" back backTo={ROUTES.more} search={false} subtitle="Poucos lembretes, só do que importa." />

      <Card className="mt-1">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 shrink-0 rounded-[14px] bg-sand-soft inline-flex items-center justify-center">
            <BellRing size={19} className="text-sand" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-display text-[18px] leading-tight">Neste aparelho</div>
              <Pill className={perm.className}>{perm.label}</Pill>
            </div>
            <p className="text-[13.5px] text-ink-2 mt-1 leading-snug">
              {permission === 'granted'
                ? 'Tudo certo. Os lembretes aparecem enquanto o app estiver aberto.'
                : permission === 'denied'
                  ? 'O navegador bloqueou. Para liberar: Ajustes do iPhone → Notificações → MARINA OS.'
                  : permission === 'unsupported'
                    ? ios && !standalone
                      ? 'No iPhone, instale o app na Tela de Início para poder ativar.'
                      : 'Este navegador não oferece notificações.'
                    : 'Toque abaixo e o iPhone vai perguntar se pode avisar você.'}
            </p>
          </div>
        </div>
        {permission === 'default' && (
          <Button variant="primary" block className="mt-4" onClick={() => void requestPermission()}>
            Permitir notificações
          </Button>
        )}
        {permission === 'granted' && (
          <Button variant="soft" block className="mt-4" onClick={() => void test()}>
            Mandar uma de teste
          </Button>
        )}
      </Card>

      <SectionTitle>O que avisar</SectionTitle>
      <ListCard>
        {NOTIFICATION_ORDER.map((c) => {
          const meta = NOTIFICATION_META[c]
          const p = prefFor(c)
          const lead = p.leadMinutes ?? DEFAULT_LEAD[c]
          return (
            <div key={c} className="px-4 py-2.5">
              <div className="flex items-center gap-3 min-h-[44px]">
                <EmojiBubble emoji={meta.emoji} className={cn(!p.enabled && 'opacity-50')} />
                <div className={cn('flex-1 min-w-0', !p.enabled && 'opacity-60')}>
                  <div className="text-[15px] leading-snug">{meta.label}</div>
                  <div className="text-[12.5px] text-muted">{meta.text}</div>
                </div>
                <Toggle checked={p.enabled} onChange={(v) => setPref(c, { enabled: v })} label={meta.label} />
              </div>
              <AnimatePresence initial={false}>
                {p.enabled && meta.leadOptions && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 pb-1 pl-12">
                      {meta.leadOptions.map((m) => (
                        <Chip key={m} selected={lead === m} onClick={() => setPref(c, { leadMinutes: m })} className="h-8 text-[12.5px] px-3">
                          {leadLabel(m)}
                        </Chip>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </ListCard>

      <SectionTitle>Como funciona</SectionTitle>
      <Card className="bg-surface-2 border-transparent shadow-none">
        <div className="flex gap-3">
          <Info size={18} className="text-muted shrink-0 mt-0.5" />
          <div className="text-[13.5px] text-ink-2 leading-relaxed space-y-2">
            <p>No iPhone, notificações da web só funcionam com o app instalado na Tela de Início (iOS 16.4 ou mais novo).</p>
            <p>Por enquanto os lembretes aparecem enquanto o MARINA OS está aberto. Avisos com o app fechado precisam de um servidor de push, que chega em breve.</p>
          </div>
        </div>
      </Card>
      <Hint>Nunca vou te mandar cobrança. Só o empurrãozinho certo, na hora certa.</Hint>
    </Page>
  )
}
