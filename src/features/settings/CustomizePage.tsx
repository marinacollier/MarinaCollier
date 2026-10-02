import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star } from 'lucide-react'
import { ListCard, ListRow, Page, PageHeader, SectionTitle, SortableList, TONE } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { HomeWidgetId, Modality, ModuleId } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { SEED_IDS } from '@/data/seed/ids'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { EmojiBubble, Hint, Toggle } from './components'
import { HIDEABLE_MODULES, WIDGET_META } from './labels'

export default function CustomizePage() {
  const nav = useNavigate()
  const profile = useDB((db) => db.profile)
  const hasMorningRoutine = useDB((db) => db.routines.some((r) => r.id === SEED_IDS.routineMorning))

  const widgets = useMemo(() => profile.homeWidgets.filter((w) => w.id in WIDGET_META), [profile.homeWidgets])
  const moduleVisible = useMemo(() => new Map(profile.modules.map((m) => [m.id, m.visible])), [profile.modules])

  const setWidget = (id: HomeWidgetId, visible: boolean) =>
    actions.setProfile({ homeWidgets: profile.homeWidgets.map((w) => (w.id === id ? { ...w, visible } : w)) })

  const reorderWidgets = (ids: string[]) => {
    const byId = new Map(profile.homeWidgets.map((w) => [w.id, w]))
    const ordered = ids.map((id) => byId.get(id as HomeWidgetId)!).filter(Boolean)
    const rest = profile.homeWidgets.filter((w) => !ids.includes(w.id))
    actions.setProfile({ homeWidgets: [...ordered, ...rest] })
  }

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
      <PageHeader title="Personalizar meu MARINA OS" back backTo={ROUTES.more} search={false} subtitle="Já vem arrumado. Mude o que quiser, quando quiser." />

      <SectionTitle className="mt-2">Widgets da home</SectionTitle>
      <SortableList
        items={widgets}
        onReorder={reorderWidgets}
        className="card overflow-hidden divide-y divide-line/70"
        renderItem={(w, handle) => {
          const meta = WIDGET_META[w.id]
          return (
            <div className="flex items-center gap-2 min-h-[60px] pl-1.5 pr-4 py-2 bg-surface">
              {handle}
              <EmojiBubble emoji={meta.emoji} className={cn(!w.visible && 'opacity-50')} />
              <div className={cn('flex-1 min-w-0 ml-1', !w.visible && 'opacity-60')}>
                <div className="text-[15px] leading-snug">{meta.label}</div>
                <div className="text-[12.5px] text-muted truncate">{meta.text}</div>
              </div>
              <Toggle checked={w.visible} onChange={(v) => setWidget(w.id, v)} label={`Mostrar ${meta.label}`} />
            </div>
          )
        }}
      />
      <Hint>Segure o ícone ⋮⋮ e arraste para mudar a ordem na tela Hoje.</Hint>

      <SectionTitle>Módulos</SectionTitle>
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
      <Hint>Módulos escondidos saem do Mais, mas nada é apagado. Dá pra voltar quando quiser.</Hint>

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
        <ListRow leading={<EmojiBubble emoji="🔌" />} title="Integrações" subtitle="agenda, e-mail, finanças" chevron onPress={() => nav(ROUTES.integrations)} />
        <ListRow leading={<EmojiBubble emoji="🔔" />} title="Notificações" chevron onPress={() => nav(ROUTES.notifications)} />
      </ListCard>
    </Page>
  )
}
