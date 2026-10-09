/**
 * "gera meu backup" / "quando foi meu último backup?" — the backup is a file she keeps (iCloud, Drive).
 * Generating it needs her tap (the share sheet / download only opens from a tap), so Lumos answers with
 * the button instead of pretending it already saved anything.
 */
import { ROUTES } from '@/app/routes'
import { daysSinceBackup, exportBackup } from '@/features/settings/backup-io'
import { toast } from '@/app/ui-store'
import type { Handler, HandlerInput, LumosReply } from '../types'

const MAKE = /\b(?:gera|gerar|faz|fazer|cria|criar|salva|salvar|exporta|exportar)\b.*\bbackup\b|^backup$/
const WHEN = /\b(?:quando|ultimo)\b.*\bbackup\b/

function backup(input: HandlerInput): LumosReply | undefined {
  const { db, n } = input
  if (!MAKE.test(n) && !WHEN.test(n)) return undefined
  const days = daysSinceBackup({ lastBackupAt: db.profile.lastBackupAt })
  const last = db.profile.lastBackupAt ? (days === 0 ? 'Seu último backup foi hoje.' : `Seu último backup foi há ${days} ${days === 1 ? 'dia' : 'dias'}.`) : 'Você ainda não gerou nenhum backup.'
  return {
    area: 'backup',
    text: MAKE.test(n) ? `${last} É um arquivo com tudo — toca abaixo e guarda no iCloud ou no Drive.` : last,
    options: [
      {
        label: 'Gerar backup agora',
        act: {
          done: 'Abrindo o arquivo pra você guardar…',
          run: () => {
            void exportBackup()
              .then((ok) => toast(ok ? 'Backup pronto 💾' : 'O backup não foi salvo — tenta de novo?'))
              .catch(() => toast('Não consegui gerar o backup agora. Tenta de novo?'))
            return () => {}
          },
        },
      },
    ],
    link: { label: 'Backup e restauração', to: ROUTES.data },
  }
}

export const backupHandler: Handler = { id: 'backup', run: backup }
