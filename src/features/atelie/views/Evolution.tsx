/** Evolução autoral: só indicadores objetivos, a partir do que ela escreveu e marcou. Sem notas de talento. */
import { useMemo } from 'react'
import { Card, SectionTitle } from '@/components/ui'
import { useDB } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { formatDayMonth } from '@/lib/date'
import { evolution, STATUS_LABEL } from '../model'

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
          <div className="min-w-0">
            <div className="text-[13.5px] text-ink-2 truncate">{r.label}</div>
            <div className="h-1.5 rounded-full bg-surface-2 mt-1 overflow-hidden">
              <div className="h-full rounded-full bg-plum/70" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </div>
          <span className="font-sport text-[15px] text-ink tabular-nums">{r.value}</span>
        </li>
      ))}
    </ul>
  )
}

export function Evolution() {
  const db = useDB()
  const today = useToday()
  const e = useMemo(() => evolution(db, today), [db, today])
  const weekMax = Math.max(1, ...e.perWeek.map((w) => w.count))

  return (
    <div>
      <p className="text-[13.5px] text-muted leading-snug">Números do seu próprio acervo. Nenhuma nota, nenhuma comparação com ninguém — só com você mesma.</p>

      <div className="grid grid-cols-2 gap-2 mt-3">
        {[
          { n: e.total, l: 'obras no acervo' },
          { n: e.concluded, l: 'aprovadas ou publicadas' },
          { n: e.published, l: 'publicadas' },
          { n: e.versionsTotal, l: 'versões guardadas' },
        ].map((t) => (
          <div key={t.l} className="card px-3.5 py-3">
            <div className="font-display text-[26px] leading-none">{t.n}</div>
            <div className="text-[12px] text-muted mt-1">{t.l}</div>
          </div>
        ))}
      </div>

      <SectionTitle>Por status</SectionTitle>
      <Card>
        <Bars rows={e.byStatus.map((s) => ({ label: STATUS_LABEL[s.status], value: s.count }))} />
      </Card>

      {e.genres.length > 0 && (
        <>
          <SectionTitle>Gêneros</SectionTitle>
          <Card>
            <Bars rows={e.genres.map((g) => ({ label: g.genre, value: g.count }))} />
          </Card>
        </>
      )}

      {e.themes.length > 0 && (
        <>
          <SectionTitle>Temas recorrentes</SectionTitle>
          <Card>
            <Bars rows={e.themes.slice(0, 10).map((t) => ({ label: t.tag, value: t.count }))} />
            <p className="text-[12px] text-muted mt-3">Contados a partir dos temas que você marcou em cada obra.</p>
          </Card>
        </>
      )}

      {e.symbols.length > 0 && (
        <>
          <SectionTitle>Imagens e símbolos</SectionTitle>
          <Card>
            <Bars rows={e.symbols.slice(0, 10).map((t) => ({ label: t.tag, value: t.count }))} />
          </Card>
        </>
      )}

      <SectionTitle>Frequência de escrita</SectionTitle>
      <Card>
        <div className="flex items-end gap-1.5 h-24" role="img" aria-label={`Versões por semana nas últimas ${e.perWeek.length} semanas: ${e.perWeek.map((w) => w.count).join(', ')}`}>
          {e.perWeek.map((w) => (
            <div key={w.weekStart} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
              <span className="text-[11px] text-muted tabular-nums">{w.count || ''}</span>
              <div className="w-full rounded-t-md bg-plum/60" style={{ height: `${Math.max(w.count ? 8 : 2, (w.count / weekMax) * 70)}%`, opacity: w.count ? 1 : 0.35 }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-muted mt-1.5">
          <span>{formatDayMonth(e.perWeek[0].weekStart)}</span>
          <span>esta semana</span>
        </div>
        <p className="text-[12px] text-muted mt-2">Versões guardadas por semana (cada sessão de escrita vira uma versão).</p>
      </Card>

      <SectionTitle>Revisões por obra</SectionTitle>
      <Card>
        {e.revisions.length ? <Bars rows={e.revisions.map((r) => ({ label: r.title, value: r.versions }))} /> : <p className="text-[14px] text-muted">Nenhuma versão guardada ainda.</p>}
      </Card>

      <SectionTitle>Da primeira versão à aprovação</SectionTitle>
      <Card>
        {e.toApproval.length ? (
          <ul className="space-y-1.5">
            {e.toApproval.map((a) => (
              <li key={a.workId} className="flex justify-between gap-3 text-[14px]">
                <span className="font-display truncate">{a.title}</span>
                <span className="text-muted shrink-0">{a.days === 0 ? 'no mesmo dia' : `${a.days} ${a.days === 1 ? 'dia' : 'dias'}`}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">Nenhuma versão aprovada no app ainda.</p>
        )}
      </Card>

      <SectionTitle>Leitura editorial</SectionTitle>
      <Card>
        <p className="text-[14px] text-ink-2">Análise editorial com IA: em breve.</p>
        <p className="text-[12.5px] text-muted mt-1">Originalidade, imagens, ritmo, subtexto, encerramentos — com argumentos tirados dos seus textos, nunca uma nota.</p>
      </Card>
    </div>
  )
}
