/**
 * AJUSTES — reached from the avatar on Início (not a tab). Seven doors, nothing else:
 * Conexões · Perfil · Lumos Memory · Notificações · Design · Backup · Privacidade.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Brain, Database, Palette, Plug, Share, Shield, SquarePlus, UserRound, X } from 'lucide-react'
import { IconButton, ListCard, ListRow, Page, PageHeader } from '@/components/ui'
import { useDB } from '@/data/store'
import { ROUTES } from '@/app/routes'
import { AppMark } from './components'
import { APP_VERSION, isStandalone, lsGet, lsSet } from './platform'

const INSTALL_HINT_KEY = 'marina-os-install-hint-dismissed'

export default function SettingsPage() {
  const nav = useNavigate()
  const profile = useDB((db) => db.profile)
  const memoryCount = useDB((db) => db.memory.length)
  const [hintDismissed, setHintDismissed] = useState(() => lsGet(INSTALL_HINT_KEY) === '1')
  const standalone = useMemo(() => isStandalone(), [])
  const name = profile.name?.trim() || 'Marina'
  const theme = profile.theme === 'dark' ? 'escuro' : profile.theme === 'light' ? 'claro' : 'automático'

  return (
    <Page>
      <PageHeader title="Ajustes" back backTo={ROUTES.today} search={false} />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <button type="button" onClick={() => nav(ROUTES.profile)} className="w-full flex items-center gap-4 py-2 text-left active:opacity-80">
          <span className="h-14 w-14 rounded-full bg-accent-soft text-accent font-display text-[26px] inline-flex items-center justify-center shrink-0">{name.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0">
            <span className="block font-display text-[22px] leading-tight">{name}</span>
            <span className="block text-[13.5px] text-muted mt-0.5 truncate">{profile.homeBase || 'em constante movimento'}</span>
          </span>
        </button>

        <AnimatePresence initial={false}>
          {!standalone && !hintDismissed && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="card relative p-4 pr-12 mt-4 bg-accent-soft border-transparent">
                <div className="flex items-start gap-3">
                  <SquarePlus size={20} className="text-accent shrink-0 mt-0.5" />
                  <p className="text-[13.5px] text-ink-2 leading-snug">
                    Instale no iPhone: Safari → Compartilhar <Share size={13} className="inline -mt-0.5" /> → Adicionar à Tela de Início.
                  </p>
                </div>
                <IconButton label="Dispensar dica" size="sm" className="absolute top-2 right-2" onClick={() => (lsSet(INSTALL_HINT_KEY, '1'), setHintDismissed(true))}>
                  <X size={16} />
                </IconButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ListCard className="mt-6">
          <ListRow leading={<Plug size={19} className="text-ocean" />} title="Conexões" subtitle="agenda, e-mail, finanças" chevron onPress={() => nav(ROUTES.integrations)} />
          <ListRow leading={<UserRound size={19} className="text-accent" />} title="Perfil" subtitle="ritmo, trabalho, sobre mim" chevron onPress={() => nav(ROUTES.profile)} />
          <ListRow
            leading={<Brain size={19} className="text-plum" />}
            title="O que Lumos sabe sobre mim"
            subtitle={memoryCount ? `${memoryCount} ${memoryCount === 1 ? 'coisa' : 'coisas'} — edite, corrija, apague` : 'fatos, preferências e o momento atual'}
            chevron
            onPress={() => nav(ROUTES.memory)}
          />
          <ListRow leading={<Bell size={19} className="text-sand" />} title="Notificações" subtitle="poucos lembretes, só do que importa" chevron onPress={() => nav(ROUTES.notifications)} />
          <ListRow leading={<Palette size={19} className="text-sage" />} title="Design" subtitle={`tema ${theme} · espaços · modalidades`} chevron onPress={() => nav(ROUTES.customize)} />
          <ListRow leading={<Database size={19} className="text-ocean" />} title="Backup" subtitle="exportar, importar, CSV" chevron onPress={() => nav(ROUTES.data)} />
          <ListRow leading={<Shield size={19} className="text-ink-2" />} title="Privacidade" subtitle="onde seus dados ficam" chevron onPress={() => nav(ROUTES.privacy)} />
        </ListCard>
      </motion.div>

      <footer className="mt-12 flex flex-col items-center text-center gap-2 pb-2">
        <AppMark size={36} />
        <p className="text-[12.5px] text-muted leading-snug max-w-[28ch]">
          <span className="font-semibold tracking-wide">MARINA OS</span> · em constante movimento: corpo, mente e vida.
        </p>
        <p className="text-[11.5px] text-muted/80">versão {APP_VERSION}</p>
      </footer>
    </Page>
  )
}
