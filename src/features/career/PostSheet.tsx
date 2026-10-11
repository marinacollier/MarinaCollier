/**
 * One LinkedIn post, from idea to published URL (Modo A). The app never talks to LinkedIn:
 * draft → review → Marina approves the exact text → copy + open LinkedIn → she publishes → pastes the URL.
 */
import { useMemo, useState } from 'react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { useDB } from '@/data/store'
import {
  POST_CHAR_LIMIT,
  POST_STATUS_LABEL,
  SEE_MORE_APPROX,
  addMetric,
  approvePost,
  archivePost,
  createPost,
  markPublished,
  normalizeBody,
  reopenDraft,
  reviewBlockers,
  savePost,
  sendToReview,
  textToPublish,
} from '@/data/career/posts'
import type { ExecPost } from '@/data/types'
import { Button, Checkbox, DateInput, Field, MoreOptions, Segmented, SheetLayout, TextArea, TextInput, TitleInput } from '@/components/ui'
import { LockGate } from '@/components/layout/LockGate'
import { useToday } from '@/hooks/useToday'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'

const LINKEDIN_FEED = 'https://www.linkedin.com/feed/'

const done = (msg: string, undo?: () => void, close = true) => {
  haptic('success')
  toast(msg, undo ? { action: { label: 'Desfazer', run: undo } } : undefined)
  if (close) closeSheet()
}

export function PostSheet(props: SheetProps<'execPost'>) {
  return (
    <LockGate area="carreira" compact>
      <PostForm {...props} />
    </LockGate>
  )
}

function PostForm({ id, fromWinId }: SheetProps<'execPost'>) {
  const post = useDB((db) => db.execPosts.find((p) => p.id === id))
  const win = useDB((db) => (fromWinId ? db.wins.find((w) => w.id === fromWinId) : undefined))
  const savedTerms = useDB((db) => db.profile.execBlockedTerms)
  const blockedTerms = useMemo(() => savedTerms ?? [], [savedTerms])
  const [title, setTitle] = useState(post?.title ?? win?.title ?? '')
  const [body, setBody] = useState(post?.body ?? '')
  const [language, setLanguage] = useState<ExecPost['language']>(post?.language ?? 'en')
  const [pillar, setPillar] = useState(post?.pillar ?? '')
  const [plannedDate, setPlannedDate] = useState(post?.plannedDate)
  const [ndaOk, setNdaOk] = useState(post?.checks.ndaOk ?? false)
  const [claimsVerified, setClaimsVerified] = useState(post?.checks.claimsVerified ?? false)
  const [notes, setNotes] = useState(post?.notes ?? (win ? [win.description, win.impact].filter(Boolean).join('\n') : ''))

  const locked = post && (post.status === 'revisao' || post.status === 'aprovado' || post.status === 'publicado')
  const fields = {
    title: title.trim(),
    body,
    language,
    pillar: pillar.trim() || undefined,
    plannedDate,
    checks: { ndaOk, claimsVerified },
    notes: notes.trim() || undefined,
  }
  const blockers = useMemo(() => reviewBlockers({ body, checks: { ndaOk, claimsVerified } }, blockedTerms), [body, ndaOk, claimsVerified, blockedTerms])

  /** Persists the form; returns the post id. */
  const persist = (): string | undefined => {
    if (!fields.title) return undefined
    if (!post) {
      const { post: created } = createPost({ ...fields, sourceWinIds: fromWinId ? [fromWinId] : undefined })
      return created.id
    }
    const { invalidated } = savePost(post.id, locked ? { title: fields.title, language, pillar: fields.pillar, plannedDate, notes: fields.notes } : fields)
    if (invalidated) toast('Aprovação removida porque o texto mudou')
    return post.id
  }

  const save = () => {
    const saved = persist()
    if (saved) done(post ? 'Post salvo ✓' : 'Post criado ✓')
  }

  const toReview = () => {
    const saved = persist()
    if (!saved) return
    const r = sendToReview(saved, blockedTerms)
    if (!r.ok) return toast(r.blockers[0] ?? 'Ainda não dá pra revisar')
    done('Em revisão — leia com calma antes de aprovar', r.undo)
  }

  const statusChip = post && (
    <span className="text-[11.5px] h-5 px-2 rounded-full bg-surface-2 text-ink-2 inline-flex items-center">{POST_STATUS_LABEL[post.status]}</span>
  )

  return (
    <SheetLayout
      title={post ? undefined : 'Novo post'}
      eyebrow={<span className="inline-flex items-center gap-2">LinkedIn {statusChip}</span>}
      onClose={closeSheet}
      onDelete={post && post.status !== 'publicado' ? () => done('Post arquivado', archivePost(post.id)) : undefined}
      primary={{ label: post ? 'Salvar' : 'Criar', onClick: save, disabled: !title.trim() }}
    >
      <TitleInput autoFocus={!post} placeholder="Tema (só pra você)" value={title} onChange={(e) => setTitle(e.target.value)} />

      {locked ? (
        <LockedBody post={post!} />
      ) : (
        <Field
          label="Texto do post"
          hint={
            <span className={cn(normalizeBody(body).length > POST_CHAR_LIMIT && 'text-accent')}>
              {normalizeBody(body).length.toLocaleString('pt-BR')}/{POST_CHAR_LIMIT.toLocaleString('pt-BR')} · as primeiras ~{SEE_MORE_APPROX} letras aparecem antes do “ver mais” (aproximado)
            </span>
          }
        >
          <TextArea rows={10} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva aqui. Nada sai do app sem a sua aprovação." />
        </Field>
      )}

      {!locked && normalizeBody(body) && (
        <div className="rounded-2xl bg-surface-2 p-3 text-[13px] leading-snug">
          <div className="eyebrow mb-1">Antes do “ver mais” (aproximado)</div>
          <p className="whitespace-pre-line">
            {normalizeBody(body).slice(0, SEE_MORE_APPROX)}
            {normalizeBody(body).length > SEE_MORE_APPROX ? '… ver mais' : ''}
          </p>
        </div>
      )}

      {!locked && (
        <>
          <div className="space-y-2">
            <label className="flex items-start gap-3 text-[14px]">
              <Checkbox checked={ndaOk} onChange={setNdaOk} label="Sem cliente nem dado confidencial" />
              <span>Sem cliente, projeto interno nem dado confidencial</span>
            </label>
            <label className="flex items-start gap-3 text-[14px]">
              <Checkbox checked={claimsVerified} onChange={setClaimsVerified} label="Cargos e números são reais" />
              <span>Cargos, datas e números citados são reais e confirmados</span>
            </label>
          </div>
          {blockers.length > 0 && normalizeBody(body) && (
            <ul className="text-[12.5px] text-sand space-y-0.5">
              {blockers.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
          )}
          <Button variant="outline" block onClick={toReview} disabled={!title.trim() || blockers.length > 0}>
            Enviar para revisão
          </Button>
        </>
      )}

      {post?.status === 'revisao' && <ApproveBlock post={post} blockedTerms={blockedTerms} />}
      {post?.status === 'aprovado' && <PublishBlock post={post} />}
      {post?.status === 'publicado' && <PublishedBlock post={post} />}

      <Field label="Idioma">
        <Segmented
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'en', label: 'EN' },
            { value: 'pt', label: 'PT' },
            { value: 'en+pt', label: 'EN + PT' },
          ]}
        />
      </Field>
      <MoreOptions>
        <Field label="Pilar" hint="ex.: IA em finanças reguladas · plataformas e crédito · liderança">
          <TextInput value={pillar} onChange={(e) => setPillar(e.target.value)} />
        </Field>
        <Field label="Quero publicar em">
          <DateInput value={plannedDate} onChange={setPlannedDate} />
        </Field>
        <Field label="Notas (não vão pro post)">
          <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}

function LockedBody({ post }: { post: ExecPost }) {
  const text = post.publication?.finalBody ?? post.approval?.bodySnapshot ?? post.body
  return (
    <div>
      <div className="rounded-2xl border border-line p-3 text-[14px] leading-relaxed whitespace-pre-line">{text}</div>
      {post.status !== 'publicado' && (
        <button
          type="button"
          className="mt-1.5 text-[13px] text-accent h-9"
          onClick={() => {
            const undo = reopenDraft(post.id)
            toast(post.status === 'aprovado' ? 'Voltou pra rascunho — a aprovação saiu' : 'Voltou pra rascunho', { action: { label: 'Desfazer', run: undo } })
            closeSheet()
          }}
        >
          Editar texto (volta pra rascunho)
        </button>
      )}
    </div>
  )
}

function ApproveBlock({ post, blockedTerms }: { post: ExecPost; blockedTerms: string[] }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="rounded-2xl bg-surface-2 p-4 space-y-2">
      <div className="eyebrow">Sua aprovação</div>
      <p className="text-[13px] text-ink-2">Aprovar grava exatamente o texto acima. Qualquer mudança depois tira a aprovação.</p>
      <Button
        variant="primary"
        block
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const r = await approvePost(post.id, blockedTerms)
          setBusy(false)
          if (!r.ok) return toast(r.blockers[0] ?? 'Não deu pra aprovar')
          done('Aprovado ✓ — pronto pra copiar', r.undo, false)
        }}
      >
        Aprovo este texto
      </Button>
    </div>
  )
}

function PublishBlock({ post }: { post: ExecPost }) {
  const today = useToday()
  const [url, setUrl] = useState('')
  const [date, setDate] = useState<string | undefined>(today)
  const [same, setSame] = useState(true)
  const [finalBody, setFinalBody] = useState('')
  const text = textToPublish(post)

  const copyAndOpen = async () => {
    if (!text) return toast('O texto mudou depois da aprovação — aprova de novo')
    try {
      await navigator.clipboard.writeText(text)
      haptic('success')
      toast('Texto aprovado copiado ✓ — cole no LinkedIn')
    } catch {
      toast('Não consegui copiar — segure o texto acima e copie à mão')
    }
    window.open(LINKEDIN_FEED, '_blank', 'noopener,noreferrer')
  }

  const register = () => {
    if (!date) return
    const r = markPublished(post.id, { url, date, matchesApproved: same, finalBody })
    if (!r.ok) return toast(r.reason)
    done('Publicado e registrado ✓ — conta nos posts da semana', r.undo)
  }

  return (
    <div className="rounded-2xl bg-surface-2 p-4 space-y-3">
      <div className="eyebrow">Publicar (você publica, o app só registra)</div>
      <Button variant="primary" block onClick={copyAndOpen} disabled={!text}>
        Copiar texto e abrir LinkedIn
      </Button>
      <Field label="Link do post publicado" hint="no post: ⋯ → Copiar link para o post">
        <TextInput inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/posts/…" />
      </Field>
      <Field label="Publicado em">
        <DateInput value={date} onChange={setDate} />
      </Field>
      <label className="flex items-start gap-3 text-[14px]">
        <Checkbox checked={same} onChange={setSame} label="Publiquei exatamente o texto aprovado" />
        <span>Publiquei exatamente o texto aprovado</span>
      </label>
      {!same && (
        <Field label="Texto que foi ao ar" hint="pra o histórico ficar fiel">
          <TextArea rows={5} value={finalBody} onChange={(e) => setFinalBody(e.target.value)} />
        </Field>
      )}
      <Button variant="outline" block onClick={register} disabled={!url.trim() || !date}>
        Registrar publicação
      </Button>
    </div>
  )
}

const num = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Math.round(Number(s.replace(/\D/g, '')))))

function PublishedBlock({ post }: { post: ExecPost }) {
  const today = useToday()
  const pub = post.publication!
  const [on, setOn] = useState<string | undefined>(today)
  const [vals, setVals] = useState({ impressions: '', membersReached: '', reactions: '', comments: '', reposts: '' })
  const set = (k: keyof typeof vals) => (e: React.ChangeEvent<HTMLInputElement>) => setVals((v) => ({ ...v, [k]: e.target.value }))
  const any = Object.values(vals).some((v) => v.trim())
  return (
    <div className="rounded-2xl bg-surface-2 p-4 space-y-3">
      <div className="eyebrow">Publicado em {pub.publishedOn.split('-').reverse().join('/')}</div>
      <a href={pub.url} target="_blank" rel="noopener noreferrer" className="text-[13.5px] text-accent break-all">
        {pub.url}
      </a>
      {!pub.matchesApproved && <p className="text-[12.5px] text-sand">Foi ao ar com mudanças em relação ao texto aprovado.</p>}
      {(post.metrics ?? []).length > 0 && (
        <ul className="text-[12.5px] text-ink-2 space-y-0.5">
          {post.metrics!.map((m) => (
            <li key={`${m.capturedOn}-${m.source}`}>
              {m.capturedOn.split('-').reverse().join('/')}: {m.impressions ?? '—'} impressões · {m.reactions ?? '—'} reações · {m.comments ?? '—'} comentários · {m.reposts ?? '—'} reposts
            </li>
          ))}
        </ul>
      )}
      <MoreOptions label="Anotar números do Analytics">
        <Field label="Lido em">
          <DateInput value={on} onChange={setOn} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <TextInput inputMode="numeric" placeholder="Impressões" value={vals.impressions} onChange={set('impressions')} />
          <TextInput inputMode="numeric" placeholder="Membros alcançados" value={vals.membersReached} onChange={set('membersReached')} />
          <TextInput inputMode="numeric" placeholder="Reações" value={vals.reactions} onChange={set('reactions')} />
          <TextInput inputMode="numeric" placeholder="Comentários" value={vals.comments} onChange={set('comments')} />
          <TextInput inputMode="numeric" placeholder="Reposts" value={vals.reposts} onChange={set('reposts')} />
        </div>
        <Button
          variant="outline"
          block
          disabled={!any || !on}
          onClick={() => {
            const undo = addMetric(post.id, {
              capturedOn: on!,
              source: 'manual',
              impressions: num(vals.impressions),
              membersReached: num(vals.membersReached),
              reactions: num(vals.reactions),
              comments: num(vals.comments),
              reposts: num(vals.reposts),
            })
            done('Números anotados ✓', undo, false)
            setVals({ impressions: '', membersReached: '', reactions: '', comments: '', reposts: '' })
          }}
        >
          Guardar números
        </Button>
      </MoreOptions>
    </div>
  )
}
