import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, FileSpreadsheet, HardDrive, History, RotateCcw, ShieldCheck, Sprout, Upload } from 'lucide-react'
import { Button, Card, Page, PageHeader, SectionTitle } from '@/components/ui'
import { actions, flushNow, getDB, useDB } from '@/data/store'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { nowISO } from '@/lib/id'
import { haptic } from '@/lib/haptics'
import { formatFullDate, todayKey } from '@/lib/date'
import { makeBackup, parseBackupText, type BackupPreview } from './backup'
import { daysSinceBackup, exportBackup, restoreBackup } from './backup-io'
import { listSnapshots, restoreSnapshot, type SnapshotInfo } from '@/data/snapshots'
import { ImportCenter } from './ImportCenter'
import { ContextExport } from './ContextExport'
import { CSV_DATASETS, datasetCSV, type CsvDatasetId } from './csv'
import { formatBytes, saveFile } from './platform'
import { Hint } from './components'
import { ImportHistory } from './ImportHistory'
import { CloudStatusLine, CloudSyncSection } from './CloudSyncSection'

interface StorageInfo {
  usage?: number
  quota?: number
  persisted?: boolean
}

function useStorageInfo(): StorageInfo | null {
  const [info, setInfo] = useState<StorageInfo | null>(null)
  useEffect(() => {
    let alive = true
    const s = navigator.storage
    if (!s) return
    void Promise.all([s.estimate?.().catch(() => undefined), s.persisted?.().catch(() => undefined)]).then(([est, persisted]) => {
      if (alive) setInfo({ usage: est?.usage, quota: est?.quota, persisted })
    })
    return () => {
      alive = false
    }
  }, [])
  return info
}

/** Copies the app took by itself before each import / restore (this device only). */
function Snapshots() {
  const batches = useDB((db) => db.importBatches)
  const [list, setList] = useState<SnapshotInfo[]>([])
  const [armed, setArmed] = useState<string>()
  useEffect(() => {
    let alive = true
    void listSnapshots().then((l) => alive && setList(l))
    return () => {
      alive = false
    }
  }, [batches])
  if (!list.length) return null
  const restore = async (id: string) => {
    try {
      await restoreSnapshot(id)
      setArmed(undefined)
      haptic('success')
      toast('Voltei o app para antes da importação ✓')
    } catch {
      toast('Não consegui gravar a cópia no aparelho — nada mudou.')
    }
  }
  return (
    <>
      <SectionTitle>Cópias automáticas</SectionTitle>
      <Card className="p-0 overflow-hidden">
        <ul className="divide-y divide-line/70">
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 min-h-[56px] py-2">
              <History size={16} className="text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] truncate">{s.reason}</div>
                <div className="text-[12.5px] text-muted">
                  {new Date(s.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {s.records.toLocaleString('pt-BR')} registros
                </div>
              </div>
              {armed === s.id ? (
                <button type="button" onClick={() => void restore(s.id)} className="h-9 px-3 rounded-full bg-accent text-white text-[12.5px] shrink-0">
                  Sim, voltar
                </button>
              ) : (
                <button type="button" onClick={() => setArmed(s.id)} className="h-9 px-3 rounded-full bg-surface-2 text-[12.5px] text-ink-2 shrink-0">
                  Restaurar
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Hint>Antes de cada importação eu guardo uma cópia de tudo aqui no aparelho (as 3 últimas). Restaurar troca o app inteiro por aquela cópia.</Hint>
    </>
  )
}

export default function DataPage() {
  const info = useStorageInfo()
  const location = useLocation()
  const pasted = (location.state as { importText?: string } | null)?.importText
  const wantsImport = new URLSearchParams(location.search).has('importar')
  const db = useDB()
  const total = useMemo(() => Object.values(db).reduce((s: number, v) => s + (Array.isArray(v) ? v.length : 0), 0), [db])
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [resetArmed, setResetArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  // Inside the Claude app/preview (an iframe) the share sheet and downloads are blocked by the host,
  // so "Exportar" can silently do nothing there. The text path always works: select → Copiar → paste anywhere.
  const embedded = typeof window !== 'undefined' && window.self !== window.top
  const [asText, setAsText] = useState<string>()
  const [restoreText, setRestoreText] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)

  const showAsText = async () => {
    await flushNow()
    setAsText(JSON.stringify(makeBackup(getDB())))
    requestAnimationFrame(() => textRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }
  const selectAll = async () => {
    const el = textRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(0, el.value.length)
    try {
      await navigator.clipboard.writeText(el.value)
      toast('Copiado ✓ Cole numa nota, no e-mail ou na conversa com o Claude.')
    } catch {
      toast('Texto selecionado — toque nele e escolha “Copiar”.')
    }
  }
  const markSaved = async () => {
    actions.setProfile({ lastBackupAt: nowISO() })
    await flushNow()
    setAsText(undefined)
    toast('Anotado: backup guardado ✓')
  }

  const exportJSON = async () => {
    setBusy(true)
    try {
      if (embedded) {
        await showAsText()
        return
      }
      const ok = await exportBackup()
      if (ok) toast('Backup pronto 💾 Guarda o arquivo num lugar seguro (iCloud, Drive).')
    } catch (err) {
      console.error(err)
      toast('Não consegui gerar o backup agora. Tenta de novo?')
    } finally {
      setBusy(false)
    }
  }

  const exportCSV = async (id: CsvDatasetId) => {
    const csv = datasetCSV(getDB(), id)
    const ok = await saveFile(`marina-os-${id}-${todayKey()}.csv`, csv, 'text/csv;charset=utf-8')
    if (ok) toast('Planilha pronta 📄')
  }

  const onFile = async (file: File | undefined) => {
    setImportError(null)
    setPreview(null)
    if (!file) return
    try {
      const text = await file.text()
      const result = parseBackupText(text)
      if (result.ok) setPreview(result)
      else setImportError(result.error)
    } catch {
      setImportError('Não consegui ler esse arquivo. Ele precisa ser o .json do backup.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!preview) return
    try {
      await restoreBackup(preview)
      setPreview(null)
      haptic('success')
      toast(`Dados restaurados ✨ ${preview.total.toLocaleString('pt-BR')} registros de volta.`, { tone: 'win' })
    } catch (err) {
      console.error('restore failed', err instanceof Error ? err.message : 'unknown')
      setImportError('Não consegui gravar os dados restaurados no aparelho. Nada foi perdido do arquivo — tenta de novo?')
      setPreview(null)
    }
  }

  const confirmReset = async () => {
    actions.resetToSeed()
    actions.setProfile({ onboardedAt: nowISO() })
    await flushNow().catch(() => undefined)
    setResetArmed(false)
    toast('Recomeçou com o seu seed 🌱')
  }

  const usagePct = info?.usage !== undefined && info.quota ? Math.max(1, Math.round((info.usage / info.quota) * 100)) : undefined

  return (
    <Page>
      <PageHeader title="Meus dados" back backTo={ROUTES.settings} search={false} subtitle="Seus dados são seus. Leve, guarde, traga de volta." />

      <Card className="mt-1">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 shrink-0 rounded-[14px] bg-sage-soft inline-flex items-center justify-center">
            <HardDrive size={19} className="text-sage" />
          </span>
          <div className="min-w-0">
            <div className="font-display text-[18px] leading-tight">Onde ficam</div>
            <p className="text-[14px] text-ink-2 mt-1 leading-snug">
              {db.profile.cloudSync
                ? 'No seu iPhone, em IndexedDB, e uma cópia na sua conta na nuvem. Backup continua valendo.'
                : 'No seu iPhone, em IndexedDB; ainda não sincroniza entre aparelhos. Por isso vale fazer um backup de vez em quando.'}
            </p>
            <CloudStatusLine className="block text-[12.5px] text-muted mt-1" />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 mt-4">
          <div className="rounded-2xl bg-surface-2 px-3 py-2.5">
            <dt className="text-[12px] text-muted">Registros</dt>
            <dd className="font-display text-[20px] tabular-nums">{total.toLocaleString('pt-BR')}</dd>
          </div>
          <div className="rounded-2xl bg-surface-2 px-3 py-2.5">
            <dt className="text-[12px] text-muted">Espaço usado</dt>
            <dd className="font-display text-[20px] tabular-nums">{info?.usage !== undefined ? formatBytes(info.usage) : '—'}</dd>
          </div>
        </dl>
        {db.profile.seedVersion !== undefined && (
          <p className="text-[12.5px] text-muted mt-3 flex items-start gap-1.5">
            <Sprout size={14} className="mt-0.5 shrink-0" />
            <span>Seed da vida real aplicado (v{db.profile.seedVersion})</span>
          </p>
        )}
        {(usagePct !== undefined || info?.persisted !== undefined) && (
          <p className="text-[12.5px] text-muted mt-3 flex items-start gap-1.5">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            <span>
              {info?.persisted
                ? 'Armazenamento protegido: o navegador não apaga seus dados sozinho.'
                : 'Armazenamento comum: instalar na Tela de Início ajuda o iPhone a guardar com mais segurança.'}
              {usagePct !== undefined && info?.quota ? ` Usando ~${usagePct}% de ${formatBytes(info.quota)}.` : ''}
            </span>
          </p>
        )}
      </Card>

      <CloudSyncSection />

      <SectionTitle>Central de importação</SectionTitle>
      <ImportCenter initialText={pasted} focus={wantsImport} />

      <SectionTitle>ChatGPT</SectionTitle>
      <ContextExport />

      <SectionTitle>Backup</SectionTitle>
      <Card>
        <p className="text-[14px] text-ink-2 leading-snug">Um arquivo com tudo: tarefas, treinos, comida, livros, carreira, dinheiro, viagens, ajustes.</p>
        <p className="text-[12.5px] text-muted mt-1">
          {db.profile.lastBackupAt
            ? `Último backup: ${formatFullDate(todayKey(new Date(db.profile.lastBackupAt)))}.`
            : 'Você ainda não gerou um backup. Seus dados vivem só neste aparelho.'}
        </p>
        {(() => {
          const days = daysSinceBackup(db.profile)
          if (days === undefined || days < 7) return null
          return (
            <p className="text-[13px] text-ink-2 mt-2 rounded-2xl bg-sand-soft px-3 py-2" role="note">
              {db.profile.lastBackupAt ? `Faz ${days} dias do último backup.` : 'Nenhum backup ainda.'} Que tal exportar agora? Leva 10 segundos e protege tudo se o aparelho ou o link mudar.
            </p>
          )
        })()}
        <div className="grid grid-cols-2 gap-2.5 mt-3.5">
          <Button variant="primary" icon={<Download size={17} />} onClick={() => void exportJSON()} disabled={busy}>
            Exportar
          </Button>
          <Button variant="soft" icon={<Upload size={17} />} onClick={() => fileRef.current?.click()}>
            Importar
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Escolher arquivo de backup"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {!asText && (
          <button type="button" onClick={() => void showAsText()} className="mt-2 h-10 text-[13px] text-ink-2 underline underline-offset-4">
            Backup como texto (funciona dentro do app do Claude)
          </button>
        )}
        {asText && (
          <div className="mt-3 space-y-2 rounded-2xl bg-surface-2 p-3">
            <p className="text-[13px] text-ink-2 leading-snug">
              Seu backup completo ({formatBytes(new Blob([asText]).size)}). Toque em “Copiar tudo” e cole numa nota do iPhone, no e-mail ou na conversa com o Claude.
            </p>
            <textarea ref={textRef} readOnly value={asText} rows={5} aria-label="Backup em texto" className="w-full rounded-xl bg-surface p-2 font-mono text-[11px] leading-snug" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => void selectAll()}>
                Copiar tudo
              </Button>
              <Button size="sm" variant="soft" onClick={() => void markSaved()}>
                Já guardei
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAsText(undefined)}>
                Fechar
              </Button>
            </div>
          </div>
        )}
        <details className="mt-2">
          <summary className="h-10 flex items-center text-[13px] text-ink-2 cursor-pointer">Restaurar colando o texto do backup</summary>
          <textarea
            value={restoreText}
            onChange={(e) => setRestoreText(e.target.value)}
            rows={4}
            placeholder="Toque aqui e escolha Colar"
            aria-label="Colar backup em texto"
            spellCheck={false}
            className="w-full rounded-xl bg-surface-2 p-2 font-mono text-[11px] leading-snug"
          />
          <Button
            size="sm"
            variant="soft"
            className="mt-2"
            disabled={!restoreText.trim()}
            onClick={() => {
              setImportError(null)
              const r = parseBackupText(restoreText)
              if (r.ok) setPreview(r)
              else setImportError(r.error)
            }}
          >
            Ver o que tem no backup
          </Button>
        </details>
        <AnimatePresence initial={false}>
          {importError && (
            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-[13.5px] text-accent mt-3" role="alert">
              {importError}
            </motion.p>
          )}
          {preview && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-4 rounded-2xl bg-surface-2 p-3.5">
                <div className="font-display text-[17px]">Backup encontrado</div>
                <p className="text-[13px] text-muted mt-0.5">
                  {preview.exportedAt ? `Feito em ${formatFullDate(todayKey(new Date(preview.exportedAt)))} · ` : ''}
                  {preview.total.toLocaleString('pt-BR')} registros
                  {preview.upgraded ? ' · versão antiga, vou atualizar' : ''}
                </p>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-[13px]">
                  {preview.counts.map((c) => (
                    <li key={c.key} className="flex justify-between gap-2 min-w-0">
                      <span className="truncate text-ink-2">{c.label}</span>
                      <span className="tabular-nums text-muted">{c.count}</span>
                    </li>
                  ))}
                </ul>
                {(preview.duplicatesRemoved > 0 || preview.warnings.length > 0) && (
                  <p className="text-[12.5px] text-muted mt-3">
                    {preview.duplicatesRemoved > 0 && `${preview.duplicatesRemoved} repetido(s) no arquivo — fica só uma cópia. `}
                    {preview.warnings.length > 0 && `Atenção: ${preview.warnings.join(', ')} (restauro mesmo assim).`}
                  </p>
                )}
                <p className="text-[13px] text-ink-2 mt-3">Isso troca tudo o que está no app agora pelo conteúdo do arquivo — nada fica duplicado.</p>
                <div className="flex gap-2 mt-3">
                  <Button variant="ghost" onClick={() => setPreview(null)}>
                    Cancelar
                  </Button>
                  <Button variant="accent" className="flex-1" onClick={() => void confirmImport()}>
                    Substituir meus dados
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
      <Hint>
        {embedded
          ? 'Dentro do app do Claude, “Exportar” mostra o backup como texto: copie e cole numa nota ou mande para você mesma.'
          : 'No iPhone, “Exportar” abre o compartilhar: escolha “Salvar em Arquivos” ou mande pra você mesma.'}
      </Hint>

      <SectionTitle>Planilhas (CSV)</SectionTitle>
      <div className="grid grid-cols-3 gap-2.5">
        {CSV_DATASETS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => void exportCSV(d.id)}
            className="card flex flex-col items-start gap-2 p-3 min-h-[84px] text-left active:scale-[0.97] transition-transform"
          >
            <span aria-hidden className="text-[18px] leading-none">
              {d.emoji}
            </span>
            <span className="text-[14px] font-medium leading-tight">{d.label}</span>
            <FileSpreadsheet size={14} className="text-muted -mt-1" aria-hidden />
          </button>
        ))}
      </div>
      <Hint>Abre no Numbers, Excel ou Google Planilhas.</Hint>

      <Snapshots />

      <ImportHistory />

      <SectionTitle>Recomeçar</SectionTitle>
      <Card>
        <AnimatePresence mode="wait" initial={false}>
          {!resetArmed ? (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="text-[14px] text-ink-2 leading-snug">
                Volta pro começo: sua vida real como eu organizei no primeiro dia — rotina, trabalho, treinos, projetos, viagens e a Luna do jeito que vieram.
              </p>
              <Button variant="outline" className="mt-3" icon={<RotateCcw size={16} />} onClick={() => setResetArmed(true)}>
                Recomeçar com meu seed
              </Button>
            </motion.div>
          ) : (
            <motion.div key="armed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="font-display text-[17px]">Tem certeza?</div>
              <p className="text-[14px] text-ink-2 mt-1 leading-snug">
                Isso substitui todos os dados do app pelo seed inicial. O que você registrou ou editou depois some daqui — exporte um backup antes se quiser guardar.
              </p>
              <div className="flex gap-2 mt-3">
                <Button variant="ghost" onClick={() => setResetArmed(false)}>
                  Cancelar
                </Button>
                <Button variant="accent" className="flex-1" onClick={() => void confirmReset()}>
                  Sim, substituir tudo
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </Page>
  )
}
