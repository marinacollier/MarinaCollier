import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileUp, Play, Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { removeWithUndo } from '@/app/undo'
import { Button, Card, ChipSelect, EmptyState, IconButton, Page, PageHeader, Pill, ProgressBar, Segmented, Select } from '@/components/ui'
import { useDB } from '@/data/store'
import type { DB, LearningResourceType } from '@/data/types'
import { classLineOn } from '@/data/travel-mode'
import { useNow } from '@/hooks/useToday'
import { addDays, formatDayMonth, minutesToHM } from '@/lib/date'
import { KIND_LABEL, studyOptions, type StudyOption } from './candidates'
import { studyEntries, type StudyEntry } from './engine/minutes'
import { UNKNOWN_DURATION } from './engine/english'
import { domainLabel, domainsOf, goalLabel, LANG_DOMAIN, languageTracks, levelLabel, MODE_LABEL, RESOURCE_LABEL, skillLabel, trackName } from './engine/model'
import { learningStats, weekOf, type Period } from './engine/stats'
import { inProgressItems } from './engine/progress'
import { recurring } from './engine/srs'
import { EnglishCoach } from './components/EnglishCoach'
import { ImportPanel } from './components/ImportPanel'
import { LibraryPanel } from './components/LibraryPanel'
import { LocalSheet } from './components/LocalSheet'
import { ReviewPanel } from './components/ReviewPanel'
import { SessionLogger, type LoggerDefaults } from './components/SessionLogger'
import { SessionTimer } from './components/SessionTimer'

type Tab = 'visao' | 'ingles' | 'revisar' | 'biblioteca' | 'sessoes'
type PeriodKey = 'semana' | 'mes' | 'tudo'
type Panel = { kind: 'log'; defaults?: LoggerDefaults } | { kind: 'timer'; template?: string } | { kind: 'import' } | null

const TABS: { value: Tab; label: string }[] = [
  { value: 'visao', label: 'Visão' },
  { value: 'ingles', label: 'Inglês' },
  { value: 'revisar', label: 'Revisar' },
  { value: 'biblioteca', label: 'Biblioteca' },
  { value: 'sessoes', label: 'Sessões' },
]

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`)

/** Entry duration: never an invented time for a session whose duration is not confirmed. */
const dur = (e: Pick<StudyEntry, 'minutes' | 'minutesUnknown'>) => (e.minutesUnknown ? UNKNOWN_DURATION : hm(e.minutes))

function periodOf(key: PeriodKey, today: string): Period {
  if (key === 'semana') return weekOf(today)
  if (key === 'mes') return { from: addDays(today, -29), to: today }
  return { from: '2000-01-01', to: today }
}

function Bar({ label, value, max, sub }: { label: ReactNode; value: number; max: number; sub?: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13.5px]">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{hm(value)}</span>
      </div>
      <ProgressBar value={value} max={Math.max(1, max)} className="mt-1" />
      {sub && <div className="text-[12px] text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

export default function LearningPage() {
  const db = useDB()
  const { today, minutes } = useNow()
  const now = useMemo(() => ({ date: today, minutes }), [today, minutes])
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.value === params.get('v'))?.value ?? 'visao') as Tab
  const setTab = (v: Tab) => setParams(v === 'visao' ? {} : { v }, { replace: true })
  const [periodKey, setPeriodKey] = useState<PeriodKey>('semana')
  // ?area=ia (from the Estudos hub's agent cards) → opens already filtered by that domain
  const [domain, setDomain] = useState<string | undefined>(() => params.get('area') ?? undefined)
  const [topic, setTopic] = useState<string | undefined>()
  const [format, setFormat] = useState<LearningResourceType | undefined>()
  const [panel, setPanel] = useState<Panel>(null)

  const period = periodOf(periodKey, today)
  const stats = useMemo(() => learningStats(db, period, now, { domain, topic, resourceType: format }), [db, period.from, period.to, now, domain, topic, format]) // eslint-disable-line react-hooks/exhaustive-deps
  const next = useMemo(() => studyOptions(db, { date: today, freeMin: 45, energy: 3, now: minutesToHM(minutes) }, domain ? { domain } : {}), [db, today, minutes, domain])
  const close = () => setPanel(null)

  return (
    <Page>
      <PageHeader
        eyebrow="aprender"
        title="Aprendizagem"
        subtitle="o que eu estudo, em todas as áreas — sem meta de produtividade."
        backTo={ROUTES.study}
        actions={
          <>
            <IconButton label="Iniciar sessão" onClick={() => setPanel({ kind: 'timer' })}>
              <Play size={19} />
            </IconButton>
            <IconButton label="Registrar sessão" onClick={() => setPanel({ kind: 'log', defaults: domain ? { domain } : undefined })}>
              <Plus size={22} />
            </IconButton>
          </>
        }
      />
      <Segmented value={tab} onChange={setTab} options={TABS} />

      {tab === 'visao' && (
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Segmented
              value={periodKey}
              onChange={setPeriodKey}
              options={[
                { value: 'semana', label: 'Semana' },
                { value: 'mes', label: '30 dias' },
                { value: 'tudo', label: 'Tudo' },
              ]}
            />
            <ChipSelect wrap={false} clearable value={domain} onChange={(v) => (setDomain(v), setTopic(undefined))} options={domainsOf(db).map((d) => ({ value: d.id, label: `${d.emoji ?? ''} ${d.label}`.trim() }))} />
            <div className="flex gap-2">
              <Select value={topic} onChange={setTopic} placeholder="Todos os assuntos" options={stats.topics.map((t) => ({ value: t.topic, label: t.topic }))} className="flex-1" />
              <Select value={format} onChange={setFormat} placeholder="Todos os formatos" options={Object.entries(RESOURCE_LABEL).map(([value, label]) => ({ value: value as LearningResourceType, label }))} className="flex-1" />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 items-start">
            <div className="space-y-4">
              <Card aria-label="Resumo">
                <div className="eyebrow">{periodKey === 'semana' ? 'esta semana' : periodKey === 'mes' ? 'últimos 30 dias' : 'todo o histórico'}</div>
                <div className="font-display text-[30px] leading-tight mt-0.5">{hm(stats.total)}</div>
                <div className="text-[13.5px] text-muted">
                  {stats.sessions} {stats.sessions === 1 ? 'sessão' : 'sessões'}
                  {stats.classes ? ` · ${stats.classes} ${stats.classes === 1 ? 'aula' : 'aulas'}` : ''}
                  {stats.unknownDuration ? ` · ${stats.unknownDuration} com duração não confirmada` : ''} · {stats.pendingReviews} revisões pendentes
                </div>
              </Card>
              <NextCard options={next} db={db} onStart={(o) => setPanel(o.domain === LANG_DOMAIN && o.maxMin >= 45 ? { kind: 'timer', template: o.trackId === languageTracks(db)[1] ? 'tpl-espanhol-60' : 'tpl-ingles-60' } : { kind: 'log', defaults: { domain: o.domain, trackId: o.trackId, minutes: o.maxMin } })} />
              <Card aria-label="Distribuição por área">
                <div className="eyebrow mb-2">por área</div>
                {stats.byDomain.length ? (
                  <div className="space-y-2.5">
                    {stats.byDomain.map((r) => (
                      <Bar key={r.domain} label={domainLabel(db, r.domain)} value={r.minutes} max={stats.byDomain[0].minutes} sub={r.alsoTouched ? `também tocou em ${hm(r.alsoTouched)} de outras sessões` : undefined} />
                    ))}
                  </div>
                ) : (
                  <EmptyState compact title="Nenhuma sessão no período" text="Registre uma sessão ou conte à Lumos: “estudei IA por 45 minutos”." />
                )}
              </Card>
              {(!domain || domain === LANG_DOMAIN) && languageTracks(db).map((t) => <LanguageCard key={t} db={db} trackId={t} now={now} next={next.find((o) => o.trackId === t)} />)}
            </div>
            <div className="space-y-4">
              <Card aria-label="Habilidades e assuntos">
                <div className="eyebrow mb-2">habilidades</div>
                {Object.keys(stats.bySkill).length ? (
                  <div className="space-y-2">
                    {Object.entries(stats.bySkill)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => (
                        <Bar key={k} label={k === 'nao_informado' ? 'não informado' : skillLabel(k)} value={v} max={Math.max(...Object.values(stats.bySkill))} />
                      ))}
                    {stats.theory + stats.practice > 0 && <div className="text-[12.5px] text-muted">teoria {hm(stats.theory)} · prática {hm(stats.practice)}</div>}
                  </div>
                ) : (
                  <p className="text-[13.5px] text-muted">Sem habilidades registradas no período.</p>
                )}
                {stats.topics.length > 0 && (
                  <>
                    <div className="eyebrow mt-4 mb-2">assuntos</div>
                    <div className="flex flex-wrap gap-1.5">
                      {stats.topics.slice(0, 12).map((t) => (
                        <Pill key={t.topic}>
                          {t.topic} · {t.count}
                        </Pill>
                      ))}
                    </div>
                  </>
                )}
              </Card>
              <InProgress db={db} domain={domain} />
              <RecentSessions db={db} period={period} now={now} domain={domain} />
              {stats.evidence.length > 0 && (
                <Card aria-label="Evidências de aplicação">
                  <div className="eyebrow mb-2">evidências de aplicação</div>
                  {stats.evidence.slice(0, 5).map((s) => (
                    <div key={s.id} className="text-[13.5px] py-1">
                      {formatDayMonth(s.date)} · {s.evidence}
                    </div>
                  ))}
                </Card>
              )}
              <WeeklyReview db={db} now={now} />
            </div>
          </div>
        </div>
      )}

      {tab === 'ingles' && (
        <div className="mt-4">
          <EnglishCoach db={db} now={now} />
        </div>
      )}

      {tab === 'revisar' && (
        <div className="mt-4">
          <ReviewPanel />
        </div>
      )}
      {tab === 'biblioteca' && (
        <div className="mt-4">
          <LibraryPanel domain={domain} />
        </div>
      )}
      {tab === 'sessoes' && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant="soft" icon={<Plus size={15} />} onClick={() => setPanel({ kind: 'log' })}>
              Registrar
            </Button>
            <Button size="sm" variant="soft" icon={<FileUp size={15} />} onClick={() => setPanel({ kind: 'import' })}>
              Importar JSON
            </Button>
          </div>
          <RecentSessions db={db} period={{ from: '2000-01-01', to: today }} now={now} all />
        </div>
      )}

      <LocalSheet open={!!panel} onClose={close}>
        {panel?.kind === 'log' && <SessionLogger defaults={panel.defaults} onClose={close} />}
        {panel?.kind === 'timer' && <SessionTimer initialTemplate={panel.template} onClose={close} onDone={(d) => setPanel({ kind: 'log', defaults: d })} />}
        {panel?.kind === 'import' && <ImportPanel onClose={close} />}
      </LocalSheet>
    </Page>
  )
}

function NextCard({ options, db, onStart }: { options: StudyOption[]; db: DB; onStart: (o: StudyOption) => void }) {
  const o = options[0]
  if (!o) return null
  return (
    <Card aria-label="Próxima sugestão">
      <div className="eyebrow">
        próxima sugestão · {KIND_LABEL[o.kind].toLowerCase()} · {domainLabel(db, o.domain)}
      </div>
      <div className="font-display text-[20px] leading-tight mt-1">{o.title}</div>
      <div className="text-[13px] text-muted mt-0.5">
        {o.minMin === o.maxMin ? o.maxMin : `${o.minMin}–${o.maxMin}`} min · {o.reasons[0]}
      </div>
      {o.nextStep && <p className="text-[13.5px] mt-2">{o.nextStep}</p>}
      <Button size="sm" className="mt-3" icon={<Play size={14} />} onClick={() => onStart(o)}>
        Começar
      </Button>
    </Card>
  )
}

function LanguageCard({ db, trackId, now, next }: { db: DB; trackId: string; now: { date: string; minutes: number }; next?: StudyOption }) {
  const track = db.studyTracks.find((t) => t.id === trackId)
  const week = learningStats(db, weekOf(now.date), now)
  const entries = studyEntries(db, '2000-01-01', now.date, now).filter((e) => e.trackId === trackId)
  const last = entries.sort((a, b) => b.date.localeCompare(a.date))[0]
  const cards = (db.learningErrors ?? []).filter((c) => c.trackId === trackId)
  const nextReview = [...cards].sort((a, b) => a.nextReview.localeCompare(b.nextReview))[0]
  const split = week.split.find((s) => s.trackId === trackId)
  const mine = studyEntries(db, weekOf(now.date).from, now.date, now).filter((e) => e.trackId === trackId)
  const skillMin: Record<string, number> = {}
  for (const e of mine.filter((x) => !x.minutesUnknown)) for (const s of e.skills) skillMin[s] = (skillMin[s] ?? 0) + Math.round(e.minutes / e.skills.length)
  const classes = Array.from({ length: 7 }, (_, i) => addDays(now.date, i)).map((d) => ({ d, c: classLineOn(db, d) })).filter((x) => x.c && !x.c.absent)
  const top = recurring(cards, 2)
  const name = trackName(db, trackId)
  return (
    <Card aria-label={`Idioma ${name}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-display text-[20px]">
          {track?.emoji ?? '🗣️'} {name}
        </div>
        <span className="text-[12.5px] text-muted">
          {goalLabel(track, trackId)} · {levelLabel(track)}
        </span>
      </div>
      <div className="text-[13.5px] mt-1">
        {hm(split?.minutes ?? 0)} nesta semana{split ? ` · ${Math.round(split.actual * 100)}% dos idiomas (plano ${Math.round(split.planned * 100)}%)` : ''}
      </div>
      {Object.keys(skillMin).length > 0 && (
        <div className="space-y-1.5 mt-3">
          {Object.entries(skillMin)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => (
              <Bar key={k} label={skillLabel(k)} value={v} max={Math.max(...Object.values(skillMin))} />
            ))}
        </div>
      )}
      <dl className="text-[13px] mt-3 space-y-1">
        <Row label="Última sessão" value={last ? `${formatDayMonth(last.date)} · ${dur(last)}${last.source === 'aula' ? ' (aula)' : ''}` : '—'} />
        <Row label="Próxima revisão" value={nextReview ? `${formatDayMonth(nextReview.nextReview)} · ${nextReview.front}` : '—'} />
        {top.length > 0 && <Row label="Erros recorrentes" value={top.map((e) => `${e.front} (${e.count}×)`).join(' · ')} />}
        {classes.length > 0 && <Row label="Próximas aulas" value={classes.slice(0, 3).map((x) => `${formatDayMonth(x.d)} ${x.c!.start}`).join(' · ')} />}
        {next && <Row label="Sugestão" value={`${next.title} (${next.minMin}–${next.maxMin} min)`} />}
      </dl>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted shrink-0">{label}:</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  )
}

function InProgress({ db, domain }: { db: DB; domain?: string }) {
  const items = inProgressItems(db).filter((x) => !domain || x.domain === domain)
  if (!items.length) return null
  return (
    <Card aria-label="Em andamento">
      <div className="eyebrow mb-2">em andamento</div>
      {items.slice(0, 6).map(({ item, domain: d }) => (
        <div key={item.id} className="py-1.5">
          <div className="text-[14px] truncate">{item.title}</div>
          <div className="text-[12.5px] text-muted">
            {domainLabel(db, d)}
            {item.progress ? ` · ${item.progress}%` : ''}
            {item.nextContent ? ` · próximo: ${item.nextContent}` : ''}
          </div>
        </div>
      ))}
    </Card>
  )
}

function RecentSessions({ db, period, now, domain, all }: { db: DB; period: Period; now: { date: string; minutes: number }; domain?: string; all?: boolean }) {
  const list = studyEntries(db, period.from, period.to, now)
    .filter((e) => !domain || e.domain === domain || e.relatedDomains.includes(domain))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.session?.startTime ?? '').localeCompare(a.session?.startTime ?? ''))
    .slice(0, all ? 200 : 6)
  return (
    <Card aria-label="Sessões recentes">
      <div className="eyebrow mb-2">sessões recentes</div>
      {list.length === 0 && <p className="text-[13.5px] text-muted">Nada registrado ainda.</p>}
      {list.map((e) => (
        <div key={e.key} className="py-1.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[14px] truncate">
              {e.title ?? (e.trackId && e.domain === LANG_DOMAIN ? trackName(db, e.trackId) : domainLabel(db, e.domain))} · {dur(e)}
            </div>
            <div className="text-[12.5px] text-muted truncate">
              {[formatDayMonth(e.date), e.skills.map(skillLabel).join(', '), e.session?.learningMode ? MODE_LABEL[e.session.learningMode] : undefined, e.relatedDomains.length ? `também: ${e.relatedDomains.map((d) => domainLabel(db, d)).join(', ')}` : undefined, e.session?.context]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          {all && e.session && (
            <button type="button" className="text-[12px] text-muted shrink-0" onClick={() => removeWithUndo('studySessions', e.session!.id, 'Sessão apagada')}>
              apagar
            </button>
          )}
        </div>
      ))}
    </Card>
  )
}

/** Revisão semanal: what happened, read plainly — no judgement of "produtividade". */
function WeeklyReview({ db, now }: { db: DB; now: { date: string; minutes: number } }) {
  const st = learningStats(db, weekOf(now.date), now)
  const top = st.byDomain[0]
  return (
    <Card aria-label="Revisão da semana">
      <div className="eyebrow mb-1">revisão da semana</div>
      {st.sessions + st.classes === 0 ? (
        <p className="text-[13.5px] text-muted">Semana sem sessões registradas — tudo bem. Se estudou e não anotou, conte à Lumos.</p>
      ) : (
        <ul className="text-[13.5px] space-y-1">
          <li>
            {hm(st.total)} em {st.byDomain.length} {st.byDomain.length === 1 ? 'área' : 'áreas'}; mais tempo em {domainLabel(db, top.domain).toLowerCase()} ({hm(top.minutes)}).
          </li>
          {st.split.some((s) => s.minutes) && <li>Idiomas: {st.split.map((s) => `${trackName(db, s.trackId)} ${hm(s.minutes)}`).join(' · ')}.</li>}
          <li>{st.pendingReviews ? `${st.pendingReviews} revisões esperando.` : 'Nenhuma revisão atrasada.'}</li>
          {st.recurringErrors[0] && <li>Erro mais recorrente: “{st.recurringErrors[0].front}” ({st.recurringErrors[0].count}×).</li>}
        </ul>
      )}
    </Card>
  )
}
