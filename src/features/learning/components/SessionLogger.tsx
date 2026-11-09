import { useMemo, useState } from 'react'
import { toast } from '@/app/ui-store'
import { Chip, ChipSelect, Field, MoreOptions, MultiChipSelect, NumberInput, Select, SheetLayout, TextArea, TextInput, DateInput } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { LearningMode, LearningResourceType, LearningTool, NewItem } from '@/data/types'
import { useToday } from '@/hooks/useToday'
import { haptic } from '@/lib/haptics'
import { domainsOf, isLanguageSkill, LANG_DOMAIN, LANGUAGE_SKILLS, languageTracks, MODE_LABEL, RESOURCE_LABEL, SKILL_LABEL, TOOL_LABEL, toolsOf, trackLang, trackName } from '../engine/model'

export interface LoggerDefaults {
  domain?: string
  trackId?: string
  minutes?: number
  skills?: string[]
  linkedEventId?: string
  source?: 'app' | 'aula'
}

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

/** Quick session log: área, (idioma), minutos, habilidades, ferramenta, contexto, o que aprendeu. */
export function SessionLogger({ defaults = {}, onClose }: { defaults?: LoggerDefaults; onClose: () => void }) {
  const today = useToday()
  const db = useDB()
  const domains = domainsOf(db)
  const langs = languageTracks(db)
  const [domain, setDomain] = useState<string>(defaults.domain ?? LANG_DOMAIN)
  const [trackId, setTrackId] = useState<string | undefined>(defaults.trackId ?? (defaults.domain && defaults.domain !== LANG_DOMAIN ? undefined : langs[0]))
  const [minutes, setMinutes] = useState<number | undefined>(defaults.minutes ?? 30)
  const [date, setDate] = useState<string>(today)
  const [skills, setSkills] = useState<string[]>((defaults.skills ?? []).filter(isLanguageSkill))
  const [freeSkills, setFreeSkills] = useState((defaults.skills ?? []).filter((s) => !isLanguageSkill(s)).join(', '))
  const [related, setRelated] = useState<string[]>([])
  const [topics, setTopics] = useState('')
  const [tool, setTool] = useState<LearningTool | undefined>()
  const [resourceType, setResourceType] = useState<LearningResourceType | undefined>()
  const [mode, setMode] = useState<LearningMode | undefined>()
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const [learned, setLearned] = useState('')
  const [evidence, setEvidence] = useState('')
  const tools = toolsOf(db)
  const isLang = domain === LANG_DOMAIN
  const tracksOfDomain = useMemo(() => db.studyTracks.filter((t) => !t.archived && !langs.includes(t.id)), [db.studyTracks, langs])

  const save = () => {
    if (!minutes || minutes <= 0) return
    const s: NewItem<'studySessions'> = { date, minutes: Math.round(minutes), domain, source: defaults.source ?? 'app', status: 'concluido' }
    if (date < today) s.source = 'retroativo'
    if (trackId) s.trackId = trackId
    const allSkills = [...(isLang ? skills : []), ...list(freeSkills)]
    if (allSkills.length) s.skills = allSkills
    const rel = related.filter((d) => d !== domain)
    if (rel.length) s.relatedDomains = rel
    if (list(topics).length) s.topics = list(topics)
    if (tool) s.tool = tool
    if (resourceType) s.resourceType = resourceType
    if (mode) s.learningMode = mode
    if (title.trim()) s.title = title.trim()
    if (context.trim()) s.context = context.trim()
    if (learned.trim()) s.learned = learned.trim()
    if (evidence.trim()) s.evidence = evidence.trim()
    if (isLang && trackId && trackLang(trackId)) s.contentLanguage = trackLang(trackId)
    if (defaults.linkedEventId) s.linkedEventId = defaults.linkedEventId
    const created = actions.create('studySessions', s)
    haptic('success')
    toast(`${minutes} min registrados ✓`, { action: { label: 'Desfazer', run: () => void actions.remove('studySessions', created.id) } })
    onClose()
  }

  return (
    <SheetLayout title="Registrar sessão" eyebrow="aprendizagem" onClose={onClose} primary={{ label: 'Salvar sessão', onClick: save, disabled: !minutes || minutes <= 0 }}>
      <div className="space-y-4">
        <Field label="Área principal">
          <ChipSelect
            value={domain}
            onChange={(v) => {
              if (!v) return
              setDomain(v)
              setTrackId(v === LANG_DOMAIN ? langs[0] : undefined)
            }}
            options={domains.map((d) => ({ value: d.id, label: `${d.emoji ?? ''} ${d.label}`.trim() }))}
          />
        </Field>
        {isLang ? (
          <Field label="Idioma">
            <ChipSelect value={trackId} onChange={setTrackId} options={langs.map((t) => ({ value: t, label: trackName(db, t) }))} />
          </Field>
        ) : (
          tracksOfDomain.length > 0 && (
            <Field label="Trilha (opcional)">
              <ChipSelect value={trackId} onChange={setTrackId} clearable options={tracksOfDomain.map((t) => ({ value: t.id, label: `${t.emoji} ${t.name}` }))} />
            </Field>
          )
        )}
        <Field label="Minutos" hint="contam uma vez só, por mais áreas e habilidades que a sessão toque">
          <div className="flex flex-wrap items-center gap-2">
            {[15, 30, 45, 60].map((m) => (
              <Chip key={m} selected={minutes === m} onClick={() => setMinutes(m)}>
                {m}
              </Chip>
            ))}
            <NumberInput value={minutes} onChange={setMinutes} className="w-24" aria-label="Minutos" />
          </div>
        </Field>
        {isLang && (
          <Field label="Habilidades praticadas" hint="só as que você praticou de verdade">
            <MultiChipSelect value={skills} onChange={setSkills} options={LANGUAGE_SKILLS.map((s) => ({ value: s, label: SKILL_LABEL[s] }))} />
          </Field>
        )}
        <Field label="Contexto (opcional)">
          <TextInput value={context} onChange={(e) => setContext(e.target.value)} placeholder="ex.: preparação para a reunião de terça" />
        </Field>
        <Field label="O que aprendi (opcional)">
          <TextArea value={learned} onChange={(e) => setLearned(e.target.value)} rows={2} />
        </Field>
        <MoreOptions>
          <div className="space-y-4">
            <Field label="Dia">
              <DateInput value={date} onChange={(v) => v && setDate(v)} />
            </Field>
            <Field label="Título (opcional)">
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: Speaking practice / role-play" />
            </Field>
            <Field label="Também tocou">
              <MultiChipSelect value={related} onChange={setRelated} options={domains.filter((d) => d.id !== domain).map((d) => ({ value: d.id, label: d.label }))} />
            </Field>
            <Field label="Outras habilidades (separe por vírgula)">
              <TextInput value={freeSkills} onChange={(e) => setFreeSkills(e.target.value)} placeholder="business english, discovery" />
            </Field>
            <Field label="Assuntos (separe por vírgula)">
              <TextInput value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="agentes de IA, patrística" />
            </Field>
            <Field label="Ferramenta">
              <ChipSelect value={tool} onChange={setTool} clearable options={tools.map((t) => ({ value: t, label: TOOL_LABEL[t] }))} />
            </Field>
            <Field label="Formato">
              <Select value={resourceType} onChange={setResourceType} placeholder="—" options={Object.entries(RESOURCE_LABEL).map(([value, label]) => ({ value: value as LearningResourceType, label }))} />
            </Field>
            <Field label="Modo">
              <Select value={mode} onChange={setMode} placeholder="—" options={Object.entries(MODE_LABEL).map(([value, label]) => ({ value: value as LearningMode, label }))} />
            </Field>
            <Field label="Evidência de aplicação (opcional)">
              <TextInput value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="ex.: usei na reunião de 10/11" />
            </Field>
          </div>
        </MoreOptions>
      </div>
    </SheetLayout>
  )
}
