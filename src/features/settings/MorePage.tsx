import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, ChevronDown, Database, Plug, Share, SlidersHorizontal, SquarePlus, X } from 'lucide-react'
import { IconButton, ListCard, ListRow, Page, PageHeader, SectionTitle, Segmented, TONE } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import { ROUTES } from '@/app/routes'
import { cn } from '@/lib/cn'
import { MORE_MODULES, THEME_OPTIONS, type ModuleEntry } from './labels'
import { APP_VERSION, isStandalone, lsGet, lsSet } from './platform'
import { AppMark } from './components'

const INSTALL_HINT_KEY = 'marina-os-install-hint-dismissed'

function ModuleTile({ m, index, muted }: { m: ModuleEntry; index: number; muted?: boolean }) {
  const nav = useNavigate()
  return (
    <motion.button
      type="button"
      onClick={() => nav(m.to)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 14) * 0.025, duration: 0.3 }}
      className={cn(
        'card flex flex-col items-start justify-between gap-3 p-3.5 min-h-[96px] text-left active:scale-[0.97] transition-transform',
        muted && 'opacity-70',
      )}
    >
      <span aria-hidden className={cn('h-10 w-10 rounded-[14px] inline-flex items-center justify-center text-[20px] leading-none', TONE[m.tone].soft)}>
        {m.emoji}
      </span>
      <span className="text-[14px] font-medium leading-tight">{m.label}</span>
    </motion.button>
  )
}

export default function MorePage() {
  const nav = useNavigate()
  const profile = useDB((db) => db.profile)
  const [showHidden, setShowHidden] = useState(false)
  const [hintDismissed, setHintDismissed] = useState(() => lsGet(INSTALL_HINT_KEY) === '1')
  const standalone = useMemo(() => isStandalone(), [])

  const { visible, hidden } = useMemo(() => {
    const hiddenIds = new Set(profile.modules.filter((m) => !m.visible).map((m) => m.id))
    return {
      visible: MORE_MODULES.filter((m) => !m.module || !hiddenIds.has(m.module)),
      hidden: MORE_MODULES.filter((m) => m.module && hiddenIds.has(m.module)),
    }
  }, [profile.modules])

  const dismissHint = () => {
    lsSet(INSTALL_HINT_KEY, '1')
    setHintDismissed(true)
  }

  return (
    <Page>
      <PageHeader title="Mais" subtitle="Tudo o que é seu, num lugar só." />

      <AnimatePresence initial={false}>
        {!standalone && !hintDismissed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card relative p-4 pr-12 mb-5 bg-accent-soft border-transparent">
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 shrink-0 rounded-[14px] bg-surface inline-flex items-center justify-center">
                  <SquarePlus size={20} className="text-accent" />
                </span>
                <div className="min-w-0">
                  <div className="font-display text-[17px] leading-tight">Instale no iPhone</div>
                  <p className="text-[13.5px] text-ink-2 mt-1 leading-snug">
                    Safari → Compartilhar <Share size={13} className="inline -mt-0.5" /> → Adicionar à Tela de Início. Fica com cara de app e libera as notificações.
                  </p>
                </div>
              </div>
              <IconButton label="Dispensar dica" size="sm" className="absolute top-2 right-2" onClick={dismissHint}>
                <X size={16} />
              </IconButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-3 gap-2.5">
        {visible.map((m, i) => (
          <ModuleTile key={m.key} m={m} index={i} />
        ))}
      </div>

      {hidden.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowHidden((s) => !s)}
            aria-expanded={showHidden}
            className="flex items-center gap-1.5 h-11 px-1 text-[13.5px] text-muted"
          >
            <ChevronDown size={16} className={cn('transition-transform', showHidden && 'rotate-180')} />
            Escondidos ({hidden.length})
          </button>
          <AnimatePresence initial={false}>
            {showHidden && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  {hidden.map((m, i) => (
                    <ModuleTile key={m.key} m={m} index={i} muted />
                  ))}
                </div>
                <p className="text-[12.5px] text-muted px-1 mt-2">Dá pra mostrar de novo em Personalizar.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <SectionTitle>Ajustes</SectionTitle>
      <ListCard>
        <ListRow
          leading={<SlidersHorizontal size={19} className="text-accent" />}
          title="Personalizar meu MARINA OS"
          subtitle="widgets da home, módulos e modalidades"
          chevron
          onPress={() => nav(ROUTES.customize)}
        />
        <ListRow leading={<Plug size={19} className="text-ocean" />} title="Integrações" subtitle="agenda, e-mail, finanças" chevron onPress={() => nav(ROUTES.integrations)} />
        <ListRow leading={<Bell size={19} className="text-sand" />} title="Notificações" subtitle="lembretes do que importa" chevron onPress={() => nav(ROUTES.notifications)} />
        <ListRow leading={<Database size={19} className="text-sage" />} title="Meus dados & backup" subtitle="exportar, importar, CSV" chevron onPress={() => nav(ROUTES.data)} />
        <div className="px-4 py-3">
          <div className="text-[15px] mb-2.5">Tema</div>
          <Segmented value={profile.theme} onChange={(theme) => actions.setProfile({ theme })} options={THEME_OPTIONS} />
        </div>
      </ListCard>
      <button type="button" onClick={() => nav(ROUTES.settings)} className="w-full h-11 mt-2 text-[13.5px] text-muted">
        Todos os ajustes
      </button>

      <footer className="mt-10 flex flex-col items-center text-center gap-2 pb-2">
        <AppMark size={36} />
        <p className="text-[12.5px] text-muted leading-snug max-w-[28ch]">
          <span className="font-semibold tracking-wide">MARINA OS</span> · em constante movimento: corpo, mente e vida.
        </p>
        <p className="text-[11.5px] text-muted/80">versão {APP_VERSION}</p>
      </footer>
    </Page>
  )
}
