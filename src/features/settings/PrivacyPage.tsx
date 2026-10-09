/** PRIVACIDADE — where her data lives, said plainly. Only true statements; links to the real controls. */
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ROUTES } from '@/app/routes'
import { ListCard, ListRow, Page, PageHeader } from '@/components/ui'
import { useDB } from '@/data/store'
import { PrivacyLockSection } from './PrivacyLockSection'

function Item({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5 py-4 border-t border-line/60 first:border-t-0">
      <span aria-hidden className="text-[20px] leading-none mt-0.5">
        {emoji}
      </span>
      <div className="min-w-0">
        <h2 className="text-[15.5px] font-medium leading-snug">{title}</h2>
        <p className="text-[14px] text-ink-2 mt-1 leading-snug">{children}</p>
      </div>
    </div>
  )
}

export default function PrivacyPage() {
  const nav = useNavigate()
  const db = useDB()
  const generative = !!db.profile.featureFlags.aiAssistantEnabled
  return (
    <Page>
      <PageHeader title="Privacidade" back backTo={ROUTES.settings} search={false} subtitle="Seus dados são seus." />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card px-4 py-1">
        <Item emoji="📱" title="Moram neste aparelho">
          Tudo o que você registra fica guardado aqui, no armazenamento do navegador. Sem conta, sem cadastro — e você leva tudo num backup quando quiser.
        </Item>
        <Item emoji="✦" title="Lumos pensa aqui mesmo">
          {generative
            ? 'A IA generativa está habilitada: quando ela responde, só um resumo mínimo do contexto da pergunta sai do aparelho — nunca a base inteira.'
            : 'Lumos cruza seus dados com regras, no próprio aparelho. Nenhuma IA externa recebe sua vida.'}
        </Item>
        <Item emoji="🎙️" title="Voz">
          O ditado usa o reconhecimento de voz do próprio navegador (no iPhone, o do sistema). Só funciona quando você toca no microfone.
        </Item>
        <Item emoji="🔌" title="Conexões só quando você liga">
          Agenda, e-mail e finanças só sincronizam depois que você conecta — e dá pra desligar a qualquer momento.
        </Item>
      </motion.div>

      <PrivacyLockSection />

      <ListCard className="mt-5">
        <ListRow title="Conexões" subtitle="o que está ligado" chevron onPress={() => nav(ROUTES.integrations)} />
        <ListRow title="Backup" subtitle="exportar, importar, recomeçar" chevron onPress={() => nav(ROUTES.data)} />
        <ListRow title="O que Lumos sabe sobre mim" subtitle="corrigir ou apagar" chevron onPress={() => nav(ROUTES.memory)} />
      </ListCard>
    </Page>
  )
}
