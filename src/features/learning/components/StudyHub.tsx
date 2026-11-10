/**
 * Estudos (hub): "Se quiser estudar agora" (what + when, from the real engine and the real day), the study
 * agents (real status only) and the Radar de vagas (newsletters she pastes; deterministic extraction).
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookHeart, CalendarPlus, ChevronRight, Compass, GraduationCap, Languages, PenLine, Play, Sparkles, type LucideIcon } from 'lucide-react'
import { areaLocked, useLockState } from '@/app/lock-store'
import { toast } from '@/app/ui-store'
import { Button, SectionTitle, TextArea, TONE } from '@/components/ui'
import type { DB, Tone } from '@/data/types'
import { formatDayMonth } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { formatMin } from '@/features/today/home/day-checkin'
import { KIND_LABEL, type StudyOption } from '../candidates'
import { dailyStudy, putInDay, startRoute, studyAgents, studyNow, subjectOf, type StudyAgent } from '../hub'
import { actions } from '@/data/store'
import { hotSkills, marketGaps, radarItems, RADAR_SOURCE } from '../radar'
import { addNewsletter } from '../radar-ops'

// ─── Se quiser estudar agora ────────────────────────────────────────────────

/** Her daily minimum, in her order: the first open line is "agora"; ticking here = ticking on the Home. */
export function StudyDailyCard({ db, date }: { db: DB; date: string }) {
  const nav = useNavigate()
  const d = dailyStudy(db, date)
  if (!d) return null
  const go = (to?: string) => {
    if (!to) return
    if (to.startsWith('#')) document.getElementById(to.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    else nav(to)
  }
  return (
    <section aria-label="Estudos do dia" className="card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="eyebrow">estudos do dia · na sua ordem</div>
        <span className="text-[12.5px] text-muted tabular-nums">{d.done}/{d.lines.length}</span>
      </div>
      {d.next ? (
        <div className="mt-1.5">
          <div className="font-display text-[22px] leading-[1.15] tracking-tight">
            Agora: {d.next.title}
          </div>
          {d.next.note && <p className="text-[13.5px] text-ink-2 mt-1">{d.next.note}</p>}
          <div className="flex flex-wrap gap-2 mt-3">
            {d.next.to && (
              <Button size="sm" onClick={() => go(d.next!.to)}>
                <Play size={14} aria-hidden /> Começar
              </Button>
            )}
            <Button size="sm" variant="soft" onClick={() => (haptic('light'), actions.toggleOccurrence('routineItem', d.next!.id, date))}>
              Feito ✓
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[15px] mt-1.5">Tudo feito hoje ✓ — o resto (espanhol, Ateliê) é bônus.</p>
      )}
      <ul className="mt-4 divide-y divide-line/60">
        {d.lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 py-2">
            <button
              type="button"
              aria-label={l.done ? `Desfazer: ${l.title}` : `Concluir: ${l.title}`}
              onClick={() => (haptic('light'), actions.toggleOccurrence('routineItem', l.id, date))}
              className={cn('h-6 w-6 shrink-0 rounded-full border inline-flex items-center justify-center text-[12px]', l.done ? 'bg-sage text-bg border-sage' : 'border-line')}
            >
              {l.done ? '✓' : ''}
            </button>
            <button type="button" onClick={() => go(l.to)} className="flex-1 min-w-0 text-left">
              <span className={cn('block text-[15px] truncate', l.done && 'text-muted line-through decoration-muted/50')}>
                {l.emoji ? `${l.emoji} ` : ''}
                {l.title}
              </span>
            </button>
            {!!l.minutes && <span className="text-[12px] text-muted tabular-nums">{l.minutes} min</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function StudyNowCard({ db, date, nowMin }: { db: DB; date: string; nowMin: number }) {
  const nav = useNavigate()
  const now = useMemo(() => studyNow(db, date, nowMin), [db, date, nowMin])
  const { top, alternatives, when, rest } = now

  const put = () => {
    if (!top || when?.kind !== 'hoje') return
    const r = putInDay(date, top, when)
    haptic('light')
    toast(`No seu dia: ${r.message}`, r.undo ? { action: { label: 'Desfazer', run: r.undo } } : {})
  }

  return (
    <section aria-label="Se quiser estudar agora" className="card p-5 bg-ocean-soft/50">
      <div className="eyebrow">se quiser estudar agora</div>
      {rest && <p className="text-[14px] text-ink-2 mt-1.5">Hoje descansar também conta — sua energia está baixa. Se mesmo assim quiser, aqui vai o mais leve que faz sentido.</p>}
      {!top ? (
        <p className="text-[15px] text-ink-2 mt-2">Nada cabe agora: {now.ctx.freeMin < 5 ? 'não sobra tempo livre hoje.' : 'nenhum estudo em andamento ou cartão para revisar.'} Registre um estudo ou guarde algo na biblioteca para eu ter de onde sugerir.</p>
      ) : (
        <>
          <div className="font-display text-[24px] leading-[1.15] tracking-tight mt-1.5">{top.title}</div>
          <div className="text-[13.5px] text-ink-2 mt-1">
            {[subjectOf(db, top), KIND_LABEL[top.kind], top.minMin === top.maxMin ? formatMin(top.maxMin) : `${top.minMin}–${top.maxMin} min`].join(' · ')}
          </div>
          <p className="text-[14px] mt-2 font-medium" aria-label="Quando">
            {when?.kind === 'hoje'
              ? `Dá às ${when.start}, ${formatMin(when.freeMin)} livres.`
              : when?.kind === 'no_dia'
                ? `Já está no seu dia: ${when.start}–${when.end}.`
                : 'Hoje não há janela livre — amanhã de manhã.'}
          </p>
          <ul className="mt-2 space-y-1 text-[13.5px] text-ink-2" aria-label="Por quê">
            {top.reasons.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
          {top.nextStep && <p className="text-[13.5px] mt-2">Próximo passo: {top.nextStep}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Button variant="accent" icon={<Play size={15} fill="currentColor" />} onClick={() => nav(startRoute(top))}>
              Começar
            </Button>
            {when?.kind === 'hoje' && (
              <Button variant="soft" icon={<CalendarPlus size={15} />} onClick={put}>
                Pôr no meu dia
              </Button>
            )}
          </div>
          {alternatives.length > 0 && (
            <div className="mt-4 pt-3 border-t border-line/60 space-y-1">
              <div className="eyebrow text-[11px]">ou</div>
              {alternatives.map((o) => (
                <AltRow key={o.key} db={db} o={o} onOpen={() => nav(startRoute(o))} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function AltRow({ db, o, onOpen }: { db: DB; o: StudyOption; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full flex items-center gap-2 min-h-11 text-left active:opacity-70">
      <span className="flex-1 min-w-0">
        <span className="block text-[14.5px] leading-snug truncate">{o.title}</span>
        <span className="block text-[12.5px] text-muted truncate">
          {subjectOf(db, o)} · {o.minMin === o.maxMin ? formatMin(o.maxMin) : `${o.minMin}–${o.maxMin} min`}
        </span>
      </span>
      <ChevronRight size={16} className="text-muted/60 shrink-0" />
    </button>
  )
}

// ─── Agentes de estudo ──────────────────────────────────────────────────────

const AGENT_LOOK: Record<StudyAgent['key'], { icon: LucideIcon; tone: Tone }> = {
  ingles: { icon: Languages, tone: 'ocean' },
  espanhol: { icon: Languages, tone: 'sand' },
  ia_produto: { icon: Sparkles, tone: 'sage' },
  pos: { icon: GraduationCap, tone: 'plum' },
  literario: { icon: PenLine, tone: 'plum' },
  espiritualidade: { icon: BookHeart, tone: 'accent' },
  carreira: { icon: Compass, tone: 'ink' },
}

export function StudyAgents({ db, today }: { db: DB; today: string }) {
  const nav = useNavigate()
  const lock = useLockState()
  const agents = useMemo(() => studyAgents(db, today, areaLocked(db.profile.privacyLock, 'atelie', lock)), [db, today, lock])
  const go = (to: string) => {
    if (to.includes('#')) {
      const id = to.split('#')[1]
      const el = document.getElementById(id)
      if (el) return el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    nav(to)
  }
  return (
    <section aria-label="Agentes de estudo">
      <SectionTitle>Agentes de estudo</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {agents.map((a) => {
          const { icon: Icon, tone } = AGENT_LOOK[a.key]
          return (
            <button key={a.key} type="button" onClick={() => go(a.to)} aria-label={a.label} className="card p-3.5 text-left min-h-[108px] flex flex-col active:scale-[0.99] transition">
              <span aria-hidden className={cn('h-9 w-9 rounded-[12px] inline-flex items-center justify-center', TONE[tone].soft)}>
                <Icon size={18} strokeWidth={1.7} />
              </span>
              <span className="block text-[15px] font-medium leading-tight mt-2">{a.label}</span>
              {a.lines.map((l) => (
                <span key={l} className="block text-[12.5px] text-muted leading-snug mt-0.5 line-clamp-2">
                  {l}
                </span>
              ))}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ─── Radar de vagas ─────────────────────────────────────────────────────────

export function MarketRadar({ db, today }: { db: DB; today: string }) {
  const [text, setText] = useState('')
  const papers = useMemo(() => radarItems(db), [db])
  const hot = useMemo(() => hotSkills(db), [db])
  const gaps = useMemo(() => marketGaps(db), [db])

  const save = () => {
    const r = addNewsletter(text, today)
    if (r.status === 'empty') return
    if (r.status === 'duplicate') {
      toast(`Essa newsletter já está no radar (${formatDayMonth(r.item.finishedAt ?? today)}).`)
      return
    }
    setText('')
    haptic('light')
    toast(r.skills ? `Newsletter guardada · ${r.skills} ${r.skills === 1 ? 'habilidade encontrada' : 'habilidades encontradas'}` : 'Newsletter guardada · nenhuma habilidade do dicionário encontrada')
  }

  return (
    <section id="radar" aria-label="Radar de vagas" className="scroll-mt-4">
      <SectionTitle label="carreira & mercado">Radar de vagas (newsletters)</SectionTitle>
      <div className="card p-4 space-y-3">
        <p className="text-[13.5px] text-ink-2">Cole aqui o texto da newsletter de vagas que você monta no ChatGPT. Eu leio sem IA, com um dicionário fixo de habilidades, e uso isso para ordenar o que sugiro estudar.</p>
        <TextArea aria-label="Texto da newsletter" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="cole o texto da newsletter…" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] text-muted">
            {papers.length ? `${papers.length} ${papers.length === 1 ? 'newsletter' : 'newsletters'} · ${RADAR_SOURCE}` : 'nenhuma newsletter ainda'}
          </span>
          <Button size="sm" variant="primary" disabled={!text.trim()} onClick={save}>
            Guardar
          </Button>
        </div>
      </div>

      {hot.length > 0 && (
        <div className="card p-4 mt-2.5" aria-label="Habilidades em alta nas vagas">
          <div className="eyebrow mb-2">habilidades em alta nas vagas</div>
          <ol className="space-y-1.5">
            {hot.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3 text-[14px]">
                <span className="truncate">{s.label}</span>
                <span className="text-[12.5px] text-muted tabular-nums shrink-0">
                  {s.count} {s.count === 1 ? 'menção' : 'menções'} · visto {formatDayMonth(s.lastSeen)}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-[12px] text-muted mt-2">Cada vaga ou item da newsletter conta uma vez; newsletters idênticas contam uma vez só.</p>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="card p-4 mt-2.5" aria-label="Lacunas">
          <div className="eyebrow mb-1">lacunas: aparece nas vagas, você ainda não tem material</div>
          <ul className="space-y-1 text-[14px]">
            {gaps.map((s) => (
              <li key={s.id}>
                · {s.label} <span className="text-[12.5px] text-muted">({s.count} {s.count === 1 ? 'menção' : 'menções'})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
