import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, FileSpreadsheet, HardDrive, RotateCcw, ShieldCheck, Sprout, Upload } from 'lucide-react'
import { Button, Card, Page, PageHeader, SectionTitle } from '@/components/ui'
import { actions, flushNow, getDB, useDB } from '@/data/store'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { nowISO } from '@/lib/id'
import { haptic } from '@/lib/haptics'
import { formatFullDate, todayKey } from '@/lib/date'
import { backupFilename, makeBackup, validateBackup, type BackupPreview } from './backup'
import { CSV_DATASETS, datasetCSV, type CsvDatasetId } from './csv'
import { formatBytes, saveFile } from './platform'
import { Hint } from './components'

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

export default function DataPage() {
  const info = useStorageInfo()
  const db = useDB()
  const total = useMemo(() => Object.values(db).reduce((s: number, v) => s + (Array.isArray(v) ? v.length : 0), 0), [db])
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [resetArmed, setResetArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  const exportJSON = async () => {
    setBusy(true)
    try {
      await flushNow()
      const backup = makeBackup(getDB())
      const ok = await saveFile(backupFilename(), JSON.stringify(backup, null, 2), 'application/json')
      if (ok) toast('Backup pronto 💾')
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
      const result = validateBackup(JSON.parse(text))
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
    const imported = preview.db
    const onboardedAt = getDB().profile.onboardedAt ?? nowISO()
    actions.replaceDB({ ...imported, profile: { ...imported.profile, onboardedAt: imported.profile?.onboardedAt ?? onboardedAt } })
    await flushNow().catch(() => undefined)
    setPreview(null)
    haptic('success')
    toast('Dados restaurados ✨', { tone: 'win' })
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
      <PageHeader title="Meus dados" back backTo={ROUTES.more} search={false} subtitle="Seus dados são seus. Leve, guarde, traga de volta." />

      <Card className="mt-1">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 shrink-0 rounded-[14px] bg-sage-soft inline-flex items-center justify-center">
            <HardDrive size={19} className="text-sage" />
          </span>
          <div className="min-w-0">
            <div className="font-display text-[18px] leading-tight">Onde ficam</div>
            <p className="text-[14px] text-ink-2 mt-1 leading-snug">
              No seu iPhone, em IndexedDB; ainda não sincroniza entre aparelhos. Por isso vale fazer um backup de vez em quando.
            </p>
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

      <SectionTitle>Backup</SectionTitle>
      <Card>
        <p className="text-[14px] text-ink-2 leading-snug">Um arquivo com tudo: tarefas, treinos, gastos, viagens, ajustes.</p>
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
                <p className="text-[13px] text-ink-2 mt-3">Isso troca tudo o que está no app agora pelo conteúdo do arquivo.</p>
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
      <Hint>No iPhone, “Exportar” abre o compartilhar: escolha “Salvar em Arquivos” ou mande pra você mesma.</Hint>

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
