import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bell, CalendarRange, Database, Plug, SlidersHorizontal } from 'lucide-react'
import { Card, ListCard, ListRow, Page, PageHeader, SectionTitle, Segmented, TextInput } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { Hint, Stepper } from './components'
import { AboutSection, RhythmSection, WorkSection } from './ProfileSections'
import { THEME_OPTIONS } from './labels'

const hour = (h: number) => `${String(h).padStart(2, '0')}h`

export default function SettingsPage() {
  const nav = useNavigate()
  const profile = useDB((db) => db.profile)
  const [name, setName] = useState(profile.name)
  const dp = profile.dayParts

  const saveName = () => {
    const next = name.trim() || 'Marina'
    setName(next)
    if (next !== profile.name) {
      actions.setProfile({ name: next })
      toast('Nome salvo ✨')
    }
  }

  const setPart = (key: keyof typeof dp, v: number) => actions.setProfile({ dayParts: { ...dp, [key]: v } })

  return (
    <Page>
      <PageHeader title="Ajustes" back backTo={ROUTES.more} search={false} subtitle="O básico, do seu jeito." />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <SectionTitle className="mt-2">Você</SectionTitle>
        <Card>
          <label className="block">
            <span className="block text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Como posso te chamar?</span>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
              autoComplete="given-name"
              enterKeyHint="done"
            />
          </label>
          <div className="mt-4">
            <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Tema</div>
            <Segmented value={profile.theme} onChange={(theme) => actions.setProfile({ theme })} options={THEME_OPTIONS} />
          </div>
        </Card>

        <RhythmSection />
        <AboutSection />
        <WorkSection />

        <SectionTitle>Corpo</SectionTitle>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[15px]">Meta de água</div>
              <div className="text-[13px] text-muted">copos por dia 💧</div>
            </div>
            <Stepper label="meta de água" value={profile.waterGoal} min={1} max={20} onChange={(waterGoal) => actions.setProfile({ waterGoal })} />
          </div>
        </Card>

        <SectionTitle>Horários do seu dia</SectionTitle>
        <ListCard>
          <PartRow emoji="☀️" label="Manhã começa" value={dp.morningStart} min={0} max={dp.middayStart - 1} onChange={(v) => setPart('morningStart', v)} />
          <PartRow emoji="🌤️" label="Dia começa" value={dp.middayStart} min={dp.morningStart + 1} max={dp.eveningStart - 1} onChange={(v) => setPart('middayStart', v)} />
          <PartRow emoji="🌙" label="Noite começa" value={dp.eveningStart} min={dp.middayStart + 1} max={23} onChange={(v) => setPart('eveningStart', v)} />
        </ListCard>
        <Hint>A tela Hoje muda sozinha conforme o horário: manhã com rotina, dia com foco, noite com fechamento.</Hint>

        <SectionTitle>Mais ajustes</SectionTitle>
        <ListCard>
          <ListRow leading={<CalendarRange size={19} className="text-ocean" />} title="Montar minha semana" subtitle="treinos, estudos, entregas e vida, em 7 passos" chevron onPress={() => nav(ROUTES.weekPlanner)} />
          <ListRow leading={<SlidersHorizontal size={19} className="text-accent" />} title="Personalizar meu MARINA OS" chevron onPress={() => nav(ROUTES.customize)} />
          <ListRow leading={<Bell size={19} className="text-sand" />} title="Notificações" chevron onPress={() => nav(ROUTES.notifications)} />
          <ListRow leading={<Plug size={19} className="text-ocean" />} title="Integrações" chevron onPress={() => nav(ROUTES.integrations)} />
          <ListRow leading={<Database size={19} className="text-sage" />} title="Meus dados & backup" chevron onPress={() => nav(ROUTES.data)} />
        </ListCard>
      </motion.div>
    </Page>
  )
}

function PartRow({ emoji, label, value, min, max, onChange }: { emoji: string; label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[60px] px-4 py-2">
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-[18px]">
          {emoji}
        </span>
        <span className="text-[15px]">{label}</span>
      </div>
      <Stepper label={label.toLowerCase()} value={value} min={min} max={max} format={hour} onChange={onChange} />
    </div>
  )
}
