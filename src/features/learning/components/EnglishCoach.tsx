/** English Coach — evidence, not scores. Every number comes from a record; otherwise "sem evidência ainda". */
import { useMemo, type ReactNode } from 'react'
import { Card, Pill } from '@/components/ui'
import type { DB } from '@/data/types'
import { formatDayMonth } from '@/lib/date'
import {
  AUDIO_PENDING,
  englishHM,
  englishLevel,
  grammarReport,
  NO_EVIDENCE,
  patternReport,
  recentEvidence,
  reviewReport,
  skillEvidence,
  vocabularyReport,
  weeklyGoal,
  type EvidenceRow,
} from '../engine/english'
import { skillLabel } from '../engine/model'

const Empty = ({ children = NO_EVIDENCE }: { children?: ReactNode }) => <p className="text-[13.5px] text-muted">{children}</p>

function Section({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <Card aria-label={label}>
      <div className="eyebrow mb-2">{label}</div>
      {sub && <p className="text-[12.5px] text-muted -mt-1 mb-2">{sub}</p>}
      {children}
    </Card>
  )
}

function SessionLine({ e, full }: { e: EvidenceRow; full?: boolean }) {
  return (
    <li className="py-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[14px] min-w-0">{e.title}</div>
        {e.assisted && <Pill className="shrink-0">com ajuda</Pill>}
      </div>
      <div className="text-[12.5px] text-muted">
        {[formatDayMonth(e.date), e.origin ? `origem: ${e.origin}` : 'origem não informada', e.duration].join(' · ')}
      </div>
      {full && e.content.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {e.content.map((c, i) => (
            <li key={i} className="text-[12.5px]">
              <span className="font-medium">{c.label}</span>
              {c.title ? ` — ${c.title}` : ''}
              {c.items.length ? `: ${c.items.join(', ')}` : ''}
            </li>
          ))}
        </ul>
      )}
      {full && !e.content.length && e.skills.length > 0 && <div className="text-[12.5px] mt-0.5">{e.skills.map(skillLabel).join(', ')}</div>}
      {e.evidence && <div className="text-[12.5px] mt-0.5">evidência: {e.evidence}</div>}
    </li>
  )
}

function EvidenceList({ rows, max = 4 }: { rows: EvidenceRow[]; max?: number }) {
  if (!rows.length) return <Empty />
  return (
    <ul className="divide-y divide-line">
      {rows.slice(0, max).map((e) => (
        <SessionLine key={e.id} e={e} />
      ))}
    </ul>
  )
}

export function EnglishCoach({ db, now }: { db: DB; now: { date: string; minutes: number } }) {
  const data = useMemo(
    () => ({
      level: englishLevel(db),
      recent: recentEvidence(db, 8),
      grammar: grammarReport(db),
      vocab: vocabularyReport(db),
      skills: skillEvidence(db),
      patterns: patternReport(db),
      reviews: reviewReport(db, now.date),
      goal: weeklyGoal(db, now),
    }),
    [db, now],
  )
  const { level, recent, grammar, vocab, skills, patterns, reviews, goal } = data

  return (
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <div className="space-y-4">
        <Card aria-label="Nível">
          <div className="eyebrow">nível · estimativa</div>
          <div className="font-display text-[22px] leading-tight mt-0.5">{level.label}</div>
          <p className="text-[12.5px] text-muted mt-1">Estimativa provisória registrada na trilha — não é calculada a partir de horas.</p>
        </Card>

        <Section label="Evidências recentes">{recent.length ? <ul className="divide-y divide-line">{recent.map((e) => <SessionLine key={e.id} e={e} full />)}</ul> : <Empty />}</Section>

        <Section label="Gramática" sub="Domínio só com 2 acertos seguidos na revisão. Exercício com ajuda é prática.">
          {grammar.empty ? (
            <Empty />
          ) : (
            <ul className="space-y-1.5">
              {grammar.rows.map((r) => (
                <li key={r.structure} className="text-[13.5px]">
                  <div>{r.structure}</div>
                  <div className="text-[12.5px] text-muted">
                    {r.label}
                    {r.lastPracticed ? ` · último: ${formatDayMonth(r.lastPracticed)}` : ''}
                  </div>
                </li>
              ))}
              {grammar.masteredCards.length > 0 && (
                <li className="text-[12.5px] text-muted pt-1">
                  Cartões com ≥2 acertos seguidos: {grammar.masteredCards.map((c) => `“${c.back}”`).join(' · ')}
                </li>
              )}
            </ul>
          )}
        </Section>

        <Section label="Vocabulário">
          {vocab.length ? (
            <ul className="space-y-1">
              {vocab.slice(0, 20).map((v) => (
                <li key={v.word} className="text-[13.5px] flex items-baseline justify-between gap-2">
                  <span>{v.word}</span>
                  <span className="text-[12px] text-muted shrink-0">{v.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </Section>
      </div>

      <div className="space-y-4">
        <Section label="Speaking">
          <EvidenceList rows={skills.speaking} />
        </Section>
        <Section label="Business English">
          <EvidenceList rows={skills.business} />
        </Section>
        <Section label="Naturalidade" sub="Uso real (reunião, conversa, mensagem), sem ajuda.">
          <EvidenceList rows={skills.naturalidade} />
        </Section>
        <Section label="Listening e pronúncia">
          <p className="text-[13.5px]">Avaliação: {AUDIO_PENDING}.</p>
          {skills.listening.length + skills.pronunciation.length > 0 && (
            <p className="text-[12.5px] text-muted mt-1">
              Praticado: {skills.listening.length} {skills.listening.length === 1 ? 'sessão' : 'sessões'} de listening · {skills.pronunciation.length} de pronúncia.
            </p>
          )}
        </Section>

        <Section label="Erros recorrentes" sub="Padrões guardados na memória; exemplos no texto são histórico, não erros novos.">
          {patterns.length ? (
            <ul className="space-y-2">
              {patterns.map((p) => (
                <li key={p.id} className="text-[13.5px]">
                  <div>{p.text}</div>
                  <div className="text-[12.5px] text-muted">{p.cards ? `${p.cards} ${p.cards === 1 ? 'cartão de revisão' : 'cartões de revisão'} · ${p.occurrences}× registradas` : 'nenhum cartão de revisão ligado ainda'}</div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </Section>

        <Section label="Revisões">
          {reviews.cards || reviews.upcomingTasks.length || reviews.doneTasks ? (
            <>
              <p className="text-[13.5px]">
                {reviews.cards} {reviews.cards === 1 ? 'cartão' : 'cartões'} · {reviews.due} para hoje · {reviews.reviewed} já revisados
              </p>
              {reviews.upcomingTasks.length > 0 ? (
                <ul className="mt-2 space-y-0.5">
                  {reviews.upcomingTasks.slice(0, 6).map((t) => (
                    <li key={t.id} className="text-[13px]">
                      {t.date ?? t.dueDate ? `${formatDayMonth((t.date ?? t.dueDate)!)} · ` : ''}
                      {t.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-muted mt-1">Nenhuma tarefa de revisão agendada.</p>
              )}
              {reviews.doneTasks > 0 && <p className="text-[12.5px] text-muted mt-1">{reviews.doneTasks} tarefas de revisão feitas.</p>}
            </>
          ) : (
            <Empty />
          )}
        </Section>

        <Section label="Objetivos semanais">
          <p className="text-[13.5px]">{goal.label}</p>
          <p className="text-[12.5px] text-muted mt-1">
            {goal.sessions
              ? `Inglês nesta semana (fora da escola): ${englishHM(goal.confirmedMin)} confirmados em ${goal.sessions} ${goal.sessions === 1 ? 'sessão' : 'sessões'}${goal.unknownDuration ? ` · ${goal.unknownDuration} com duração não confirmada` : ''}.`
              : `Inglês nesta semana (fora da escola): ${NO_EVIDENCE}.`}
          </p>
        </Section>
      </div>
    </div>
  )
}
