import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star } from 'lucide-react'
import { Card, ListCard, ListRow, Page, PageHeader, SectionTitle, Segmented, TONE } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { Modality, ModuleId } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { SEED_IDS } from '@/data/seed/ids'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { EmojiBubble, Hint, Toggle } from './components'
import { HIDEABLE_MODULES, THEME_OPTIONS } from './labels'

/** DESIGN (Ajustes): tema, o que aparece em Espaços, modalidades. */
export default function CustomizePage() {
  const nav = useNavigate()
  const profile = useDB((db) => db.profile)
  const hasMorningRoutine = useDB((db) => db.routines.some((r) => r.id === SEED_IDS.routineMorning))

  const moduleVisible = useMemo(() => new Map(profile.modules.map((m) => [m.id, m.visible])), [profile.modules])

  const setModule = (id: ModuleId, visible: boolean) => {
    const exists = profile.modules.some((m) => m.id === id)
    actions.setProfile({
      modules: exists ? profile.modules.map((m) => (m.id === id ? { ...m, visible } : m)) : [...profile.modules, { id, visible }],
    })
  }

  const setModality = (id: string, patch: Partial<Modality>) =>
    actions.setProfile({ modalities: profile.modalities.map((m) => (m.id === id ? { ...m, ...patch } : m)) })

  return (
    <Page>
      <PageHeader title="Design" back backTo={ROUTES.settings} search={false} subtitle="Já vem arrumado. Mude o que quiser, quando quiser." />

      <SectionTitle className="mt-2">Tema</SectionTitle>
      <Card>
        <Segmented value={profile.theme} onChange={(theme) => actions.setProfile({ theme })} options={THEME_OPTIONS} />
      </Card>

      <SectionTitle>Em Espaços</SectionTitle>
      <ListCard>
        {HIDEABLE_MODULES.map((m) => {
          const visible = moduleVisible.get(m.module) ?? true
          return (
            <div key={m.key} className="flex items-center gap-3 min-h-[56px] px-4 py-2">
              <EmojiBubble emoji={m.emoji} className={cn(TONE[m.tone].soft, !visible && 'opacity-50')} />
              <span className={cn('flex-1 text-[15px]', !visible && 'text-muted')}>{m.label}</span>
              <Toggle checked={visible} onChange={(v) => setModule(m.module, v)} label={`Mostrar ${m.label}`} />
            </div>
          )
        })}
      </ListCard>
      <Hint>Escondido sai de Espaços, mas nada é apagado. E o que está vazio já não aparece sozinho.</Hint>

      <SectionTitle>Modalidades</SectionTitle>
      <ListCard>
        {profile.modalities.map((m) => (
          <div key={m.id} className="flex items-center gap-2 min-h-[56px] pl-4 pr-4 py-2">
            <EmojiBubble emoji={m.emoji} className={cn(TONE[m.tone].soft, !m.active && 'opacity-50')} />
            <span className={cn('flex-1 min-w-0 text-[15px] ml-1 truncate', !m.active && 'text-muted')}>{m.label}</span>
            <button
              type="button"
              aria-pressed={m.favorite}
              aria-label={m.favorite ? `Tirar ${m.label} dos favoritos` : `Favoritar ${m.label}`}
              onClick={() => {
                haptic('light')
                setModality(m.id, { favorite: !m.favorite })
              }}
              className="h-11 w-11 inline-flex items-center justify-center shrink-0"
            >
              <Star size={19} className={cn('transition-colors', m.favorite ? 'text-sand fill-current' : 'text-muted/60')} />
            </button>
            <Toggle checked={m.active} onChange={(v) => setModality(m.id, { active: v })} label={`${m.label} ativa`} />
          </div>
        ))}
      </ListCard>
      <Hint>⭐ Favoritas aparecem primeiro na hora de registrar um treino. Desativadas somem das opções, mas o histórico fica.</Hint>

      <SectionTitle>Também dá pra ajustar</SectionTitle>
      <ListCard>
        {hasMorningRoutine && (
          <ListRow
            leading={<EmojiBubble emoji="☀️" />}
            title="Rotina da manhã"
            subtitle="itens e dias da semana"
            chevron
            onPress={() => openSheet('routineEditor', { routineId: SEED_IDS.routineMorning })}
          />
        )}
        <ListRow leading={<EmojiBubble emoji="💸" />} title="Categorias de gastos" subtitle="em Dinheiro" chevron onPress={() => nav(ROUTES.money)} />
      </ListCard>
    </Page>
  )
}
