/** Visão geral: obra em destaque, última editada, em lapidação, totais, uma sugestão opcional, perfil de autora. */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { Button, Card, SectionTitle, TextArea } from '@/components/ui'
import { actions, persist, useDB } from '@/data/store'
import type { LiteraryAuthorProfile } from '@/data/types'
import { useToday } from '@/hooks/useToday'
import { developmentSuggestion, latestVersion, overview, workDateLabel } from '../model'
import { dismissTip } from '../ops'
import { NewWork } from '../NewWork'
import { Excerpts, SERIF, StatusPill, WorkCard } from '../parts'

export function Overview({ writing, setWriting }: { writing: boolean; setWriting: (v: boolean) => void }) {
  const db = useDB()
  const nav = useNavigate()
  const today = useToday()
  const o = useMemo(() => overview(db), [db])
  const tip = useMemo(() => developmentSuggestion(db, today), [db, today])
  const featuredBody = o.featured ? latestVersion(db, o.featured.id)?.body : undefined
  const versions = db.literaryVersions.length

  return (
    <div>
      {o.featured && (
        <Card onPress={() => nav(ROUTES.atelieWork(o.featured!.id))} className="bg-surface">
          <div className="eyebrow">Obra em destaque</div>
          <div className="font-display text-[28px] leading-[1.1] mt-1.5">{o.featured.title}</div>
          <div className="text-[12.5px] text-muted mt-1">{[workDateLabel(o.featured), o.featured.genre].filter(Boolean).join(' · ')}</div>
          {featuredBody ? (
            <p className="text-[16px] leading-[1.7] text-ink-2 mt-3 line-clamp-4 whitespace-pre-line" style={SERIF}>
              {featuredBody}
            </p>
          ) : (
            <Excerpts excerpts={o.featured.excerpts.slice(0, 1)} className="mt-3" />
          )}
          <div className="flex flex-wrap gap-1.5 mt-3">
            <StatusPill status={o.featured.status} />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-2 mt-3" aria-label="Totais">
        {[
          { n: o.total, l: o.total === 1 ? 'obra' : 'obras' },
          { n: o.inLapidacao.length, l: 'em lapidação' },
          { n: o.pending, l: 'texto pendente' },
        ].map((t) => (
          <div key={t.l} className="rounded-2xl bg-surface-2/70 px-3 py-2.5">
            <div className="font-display text-[24px] leading-none">{t.n}</div>
            <div className="text-[11.5px] text-muted mt-1">{t.l}</div>
          </div>
        ))}
      </div>

      {writing ? (
        <NewWork onClose={() => setWriting(false)} />
      ) : (
        <Button variant="primary" block className="mt-4" onClick={() => setWriting(true)}>
          Escrever
        </Button>
      )}

      {o.lastEdited && o.lastEdited.id !== o.featured?.id && (
        <>
          <SectionTitle>Última escrita editada</SectionTitle>
          <WorkCard work={o.lastEdited} />
        </>
      )}

      {o.inLapidacao.length > 0 && (
        <>
          <SectionTitle>Em lapidação</SectionTitle>
          <div className="card overflow-hidden divide-y divide-line/70">
            {o.inLapidacao.map((w) => (
              <button key={w.id} type="button" onClick={() => nav(ROUTES.atelieWork(w.id))} className="w-full text-left px-4 py-3 flex items-baseline justify-between gap-3 active:bg-surface-2">
                <span className="font-display text-[18px] truncate">{w.title}</span>
                <span className="text-[12px] text-muted shrink-0">{w.textPending ? 'texto pendente' : `${db.literaryVersions.filter((v) => v.workId === w.id).length} versões`}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {tip && (
        <>
          <SectionTitle>Uma oportunidade de evolução</SectionTitle>
          <Card>
            <p className="text-[16px] leading-relaxed" style={SERIF}>
              {tip}.
            </p>
            <p className="text-[12.5px] text-muted mt-2">Opcional — vem do seu perfil de autora. Não é tarefa.</p>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  dismissTip(tip)
                  void persist()
                  toast('Não mostro mais esta sugestão.')
                }}
              >
                Não mostrar esta
              </Button>
            </div>
          </Card>
        </>
      )}

      <SectionTitle>Análise editorial</SectionTitle>
      <Card>
        <p className="text-[14px] text-ink-2">Análise editorial com IA: em breve.</p>
        <p className="text-[12.5px] text-muted mt-1">
          Quando chegar, só vai analisar obras com texto integral no app e vai citar a versão usada. {versions ? `Hoje há ${versions} ${versions === 1 ? 'versão guardada' : 'versões guardadas'}.` : ''}
        </p>
      </Card>

      <AuthorProfile />
    </div>
  )
}

const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)

function AuthorProfile() {
  const p = useDB((db) => db.literaryProfile[0]) as LiteraryAuthorProfile | undefined
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ identity: '', strengths: '', development: '', goal: '' })
  if (!p) return null
  const open = () => {
    setForm({ identity: p.identity, strengths: p.strengths.join('\n'), development: p.developmentPoints.join('\n'), goal: p.goal })
    setEditing(true)
  }
  const save = () => {
    actions.update('literaryProfile', p.id, { identity: form.identity.trim(), strengths: lines(form.strengths), developmentPoints: lines(form.development), goal: form.goal.trim() })
    void persist()
    setEditing(false)
    toast('Perfil atualizado ✓')
  }
  return (
    <>
      <SectionTitle
        action={
          !editing ? (
            <button type="button" className="text-[13px] text-muted h-9 px-1" onClick={open}>
              editar
            </button>
          ) : undefined
        }
      >
        Perfil de autora
      </SectionTitle>
      {editing ? (
        <Card className="space-y-3">
          <TextArea aria-label="Identidade" value={form.identity} onChange={(e) => setForm({ ...form, identity: e.target.value })} rows={3} />
          <label className="block text-[13px] text-ink-2">
            Forças (uma por linha)
            <TextArea className="mt-1" value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} rows={5} />
          </label>
          <label className="block text-[13px] text-ink-2">
            Pontos de desenvolvimento (um por linha)
            <TextArea className="mt-1" value={form.development} onChange={(e) => setForm({ ...form, development: e.target.value })} rows={6} />
          </label>
          <label className="block text-[13px] text-ink-2">
            Objetivo
            <TextArea className="mt-1" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} rows={2} />
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={save}>
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-[16px] leading-relaxed italic" style={SERIF}>
            {p.identity}
          </p>
          <ProfileList title="Forças observadas" items={p.strengths} />
          <ProfileList title="Pontos de desenvolvimento" items={p.developmentPoints} />
          <div className="eyebrow mt-4">Objetivo</div>
          <p className="text-[14px] text-ink-2 mt-1 leading-snug">{p.goal}</p>
        </Card>
      )}
    </>
  )
}

function ProfileList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <>
      <div className="eyebrow mt-4">{title}</div>
      <ul className="mt-1 space-y-1">
        {items.map((s) => (
          <li key={s} className="text-[14px] text-ink-2 leading-snug pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-muted">
            {s}
          </li>
        ))}
      </ul>
    </>
  )
}
