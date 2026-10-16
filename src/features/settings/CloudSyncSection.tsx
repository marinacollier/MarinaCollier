/**
 * Ajustes → Dados → "Nuvem". Rendered only when the server is configured AND she is signed in.
 * First time: "Enviar meus dados para a nuvem" (upload → download → compare → only then sync turns on).
 */
import { useEffect, useState } from 'react'
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { Button, Card, SectionTitle } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { CollectionKey, ItemOf, SyncConflict } from '@/data/types'
import { cloudLabel, cloudReady, hasMigrated, migrateToCloud, pauseCloudSync, resumeCloudSync, syncNow, useCloudSync } from '@/data/sync'
import type { MigrationReport } from '@/data/sync/engine'
import { PROFILE_COLLECTION, profileForCloud } from '@/data/sync/engine'
import { useAuth } from '@/integrations/auth'
import { toast } from '@/app/ui-store'
import { nowISO } from '@/lib/id'
import { Hint } from './components'

/** The honest status line ("Salvo neste aparelho" / "Sincronizado"), usable anywhere. */
export function CloudStatusLine({ className }: { className?: string }) {
  const s = useCloudSync()
  const Icon = s.status === 'synced' ? Cloud : CloudOff
  return (
    <span className={className}>
      <Icon size={14} className="inline -mt-0.5 mr-1" aria-hidden />
      {cloudLabel(s)}
    </span>
  )
}

function conflictTitle(c: SyncConflict): string {
  const t = c.other && (c.other.title ?? c.other.name ?? c.other.text)
  return typeof t === 'string' && t ? t : `${c.collection} · ${c.recordId}`
}

function applyOther(c: SyncConflict) {
  if (c.collection === PROFILE_COLLECTION) {
    if (c.other) actions.setProfile(profileForCloud(c.other as never))
  } else if (!c.other) actions.remove(c.collection as CollectionKey, c.recordId)
  else actions.upsertMany(c.collection as CollectionKey, [{ ...c.other, updatedAt: nowISO() } as ItemOf<CollectionKey>])
}

function Report({ r }: { r: MigrationReport }) {
  const problems = r.issues.filter((i) => i.kind === 'missing' || i.kind === 'different')
  const newer = r.issues.length - problems.length
  return (
    <div className="mt-3 rounded-2xl bg-surface-2 p-3.5 text-[13px]">
      <div className="font-display text-[16px]">{r.ok ? 'Conferido ✓' : 'A conferência não bateu'}</div>
      <p className="text-ink-2 mt-0.5">
        Enviei {r.uploaded} · {r.matched} idênticos na nuvem
        {newer ? ` · ${newer} com versão mais nova vinda de outro aparelho` : ''}
        {r.onlyInCloud ? ` · ${r.onlyInCloud} só na nuvem (chegam na sincronização)` : ''}
      </p>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
        {r.collections.map((c) => (
          <li key={c.collection} className={`flex justify-between gap-2 min-w-0 ${c.local !== c.cloud ? 'text-accent' : ''}`}>
            <span className="truncate text-ink-2">{c.collection === PROFILE_COLLECTION ? 'perfil' : c.collection}</span>
            <span className="tabular-nums text-muted">
              {c.local} → {c.cloud}
            </span>
          </li>
        ))}
      </ul>
      {!r.ok && (
        <p className="mt-2 text-accent" role="alert">
          {problems.length} registro(s) não chegaram iguais. A sincronização continua desligada e nada mudou neste aparelho. Tente de novo.
        </p>
      )}
    </div>
  )
}

export function CloudSyncSection() {
  const signedIn = useAuth((s) => s.signedIn)
  const enabled = useDB((db) => db.profile.cloudSync === true)
  const conflicts = useDB((db) => db.profile.syncConflicts)
  const [migrated, setMigrated] = useState<boolean>()
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<MigrationReport>()

  useEffect(() => {
    let alive = true
    if (signedIn) void hasMigrated().then((m) => alive && setMigrated(m))
    return () => {
      alive = false
    }
  }, [signedIn, enabled])

  if (!cloudReady()) return null

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não deu certo agora. Seus dados continuam aqui.')
    } finally {
      setBusy(false)
    }
  }

  const dismiss = (id: string) => actions.setProfile({ syncConflicts: (conflicts ?? []).filter((c) => c.id !== id) })

  return (
    <>
      <SectionTitle>Nuvem</SectionTitle>
      <Card>
        <p className="text-[13px] text-muted">
          <CloudStatusLine />
        </p>
        {enabled ? (
          <>
            <p className="text-[14px] text-ink-2 mt-2 leading-snug">Este aparelho sincroniza com a sua conta. Tudo continua salvo aqui também, mesmo sem internet.</p>
            <div className="flex gap-2 mt-3">
              <Button variant="soft" icon={<RefreshCw size={16} />} disabled={busy} onClick={() => void run(syncNow)}>
                Sincronizar agora
              </Button>
              <Button variant="ghost" disabled={busy} onClick={pauseCloudSync}>
                Pausar
              </Button>
            </div>
          </>
        ) : migrated ? (
          <>
            <p className="text-[14px] text-ink-2 mt-2 leading-snug">Sincronização pausada neste aparelho. Nada foi apagado.</p>
            <Button variant="primary" className="mt-3" disabled={busy} onClick={() => void run(async () => void (await resumeCloudSync()))}>
              Retomar sincronização
            </Button>
          </>
        ) : (
          <>
            <p className="text-[14px] text-ink-2 mt-2 leading-snug">
              Envio uma cópia de tudo para a sua conta, baixo de volta e confiro registro por registro. Só ligo a sincronização se bater. Nada é apagado deste aparelho.
            </p>
            <Button
              variant="primary"
              className="mt-3"
              icon={<Cloud size={17} />}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await migrateToCloud()
                  setReport(r)
                  if (r.ok) toast('Seus dados estão na nuvem ✓', { tone: 'win' })
                })
              }
            >
              {busy ? 'Enviando e conferindo…' : 'Enviar meus dados para a nuvem'}
            </Button>
          </>
        )}
        {report && <Report r={report} />}
      </Card>
      <Hint>Num segundo aparelho, restaure antes o backup deste (mesmos registros) e depois toque em “Enviar” lá também — assim nada se duplica.</Hint>

      {!!conflicts?.length && (
        <>
          <SectionTitle>Para revisar ({conflicts.length})</SectionTitle>
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-line/70">
              {conflicts.map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <div className="text-[14px] truncate">{conflictTitle(c)}</div>
                  <div className="text-[12.5px] text-muted">
                    Editado em dois aparelhos · fiquei com a {c.kept === 'local' ? 'deste aparelho' : 'do outro aparelho'} (mais nova)
                    {c.other ? '' : ' · a outra era uma exclusão'}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button type="button" className="h-9 px-3 rounded-full bg-surface-2 text-[12.5px] text-ink-2" onClick={() => dismiss(c.id)}>
                      Manter assim
                    </button>
                    <button
                      type="button"
                      className="h-9 px-3 rounded-full bg-surface-2 text-[12.5px] text-ink-2"
                      onClick={() => {
                        applyOther(c)
                        dismiss(c.id)
                        toast('Troquei pela outra versão')
                      }}
                    >
                      Usar a outra versão
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  )
}
