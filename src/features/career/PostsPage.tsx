/**
 * POSTS DO LINKEDIN — Modo A. Drafts, Marina's approval, publishing by hand, URL + numbers.
 * No LinkedIn API, no scraping, no automation of the logged-in site.
 */
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { actions, useDB } from '@/data/store'
import { weekProgress } from '@/data/career/activities'
import { POST_STATUS_LABEL, latestMetric, postGroups } from '@/data/career/posts'
import { Button, Card, Page, PageHeader, SectionTitle, TextArea } from '@/components/ui'
import { LockGate } from '@/components/layout/LockGate'
import { useToday } from '@/hooks/useToday'

const fmt = (d?: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '')

export default function PostsPageGuarded() {
  return (
    <LockGate area="carreira">
      <PostsPage />
    </LockGate>
  )
}

function PostsPage() {
  const db = useDB()
  const today = useToday()
  const groups = useMemo(() => postGroups(db.execPosts), [db.execPosts])
  const postsWeek = useMemo(() => weekProgress(db, today).find((p) => p.kind === 'post'), [db, today])
  const usedWins = useMemo(() => new Set(db.execPosts.flatMap((p) => p.sourceWinIds ?? [])), [db.execPosts])
  const wins = useMemo(() => db.wins.filter((w) => !usedWins.has(w.id) && w.confidentiality !== 'confidencial').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3), [db.wins, usedWins])

  return (
    <Page>
      <PageHeader title="Posts do LinkedIn" back backTo={ROUTES.career} subtitle="você aprova cada texto; o app nunca publica sozinho" />

      <Card className="p-4 flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Esta semana</div>
          <div className="text-[15px] mt-0.5">{postsWeek ? `${postsWeek.done}/${postsWeek.target} posts publicados` : 'Meta de posts não encontrada'}</div>
        </div>
        <Button size="sm" icon={<Plus size={15} />} onClick={() => openSheet('execPost', {})}>
          Novo post
        </Button>
      </Card>

      {groups.map((g) => (
        <section key={g.status}>
          <SectionTitle>{g.status === 'aprovado' ? 'Aprovados — prontos pra publicar' : POST_STATUS_LABEL[g.status][0].toUpperCase() + POST_STATUS_LABEL[g.status].slice(1)}</SectionTitle>
          <Card className="p-4">
            <ul className="divide-y divide-line/70">
              {g.posts.map((p) => {
                const m = latestMetric(p)
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => openSheet('execPost', { id: p.id })} className="w-full text-left py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[14.5px] truncate">{p.title}</span>
                        <span className="text-[11.5px] text-muted shrink-0">{p.language.toUpperCase()}</span>
                      </div>
                      <div className="text-[12.5px] text-muted mt-0.5">
                        {p.status === 'publicado'
                          ? `publicado ${fmt(p.publication?.publishedOn)}${m?.impressions !== undefined ? ` · ${m.impressions} impressões` : ''}${m?.engagementRate !== undefined ? ` · ${(m.engagementRate * 100).toFixed(1)}% engajamento` : ''}`
                          : [p.pillar, p.plannedDate ? `pra ${fmt(p.plannedDate)}` : undefined].filter(Boolean).join(' · ') || 'sem data'}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      ))}
      {!groups.length && (
        <Card className="p-4">
          <p className="text-[13px] text-muted">Nenhum post ainda. Comece por uma ideia — ou transforme uma conquista em pauta abaixo.</p>
        </Card>
      )}

      {wins.length > 0 && (
        <>
          <SectionTitle>Conquistas que podem virar pauta</SectionTitle>
          <Card className="p-4">
            {wins.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-[13.5px] text-ink-2 truncate">{w.title}</span>
                <button type="button" onClick={() => openSheet('execPost', { fromWinId: w.id })} className="h-8 px-3 rounded-full bg-surface-2 text-[12.5px] shrink-0">
                  virar pauta
                </button>
              </div>
            ))}
          </Card>
        </>
      )}

      <BlockedTerms />

      <p className="text-[12px] text-muted px-1">
        Métricas: no LinkedIn, abra o post → Ver estatísticas e anote os números aqui. A importação do arquivo XLSX do Analytics vem depois, a partir de um arquivo real seu.
      </p>
    </Page>
  )
}

function BlockedTerms() {
  const saved = useDB((db) => db.profile.execBlockedTerms) ?? []
  const [text, setText] = useState(saved.join('\n'))
  const parsed = text
    .split(/[\n,;]/)
    .map((t) => t.trim())
    .filter(Boolean)
  const changed = parsed.join('\n') !== saved.join('\n')
  return (
    <>
      <SectionTitle>Termos bloqueados</SectionTitle>
      <Card className="p-4 space-y-2">
        <p className="text-[12.5px] text-muted">
          Nomes de clientes, projetos internos ou qualquer coisa sob confidencialidade. Um post com esses termos não vai pra revisão. Fica só neste aparelho (entra no seu backup).
        </p>
        <TextArea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="um por linha" />
        <Button
          variant="outline"
          size="sm"
          disabled={!changed}
          onClick={() => {
            const before = saved
            actions.setProfile({ execBlockedTerms: parsed })
            toast(`${parsed.length} termo(s) bloqueado(s) ✓`, { action: { label: 'Desfazer', run: () => actions.setProfile({ execBlockedTerms: before }) } })
          }}
        >
          Salvar termos
        </Button>
      </Card>
    </>
  )
}
