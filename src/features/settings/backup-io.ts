/**
 * Backup I/O used by Ajustes → Backup and by Lumos. Restore REPLACES the database (no merge, so no
 * duplicates), is persisted before success is announced, and keeps this device's onboarding mark.
 */
import { actions, flushNow, getDB } from '@/data/store'
import { nowISO } from '@/lib/id'
import { backupFilename, makeBackup, type BackupPreview } from './backup'
import { saveFile } from './platform'

/** Builds the file and hands it to the share sheet / download. Records lastBackupAt only when saved. */
export async function exportBackup(now: Date = new Date()): Promise<boolean> {
  await flushNow()
  const backup = makeBackup(getDB(), now)
  const ok = await saveFile(backupFilename(now), JSON.stringify(backup, null, 2), 'application/json')
  if (ok) {
    actions.setProfile({ lastBackupAt: now.toISOString() })
    await flushNow()
  }
  return ok
}

/** Replaces everything with the validated backup and waits for it to be on disk. Throws if saving fails. */
export async function restoreBackup(preview: BackupPreview): Promise<void> {
  const current = getDB().profile
  const imported = preview.db
  actions.replaceDB({
    ...imported,
    profile: { ...imported.profile, onboardedAt: imported.profile?.onboardedAt ?? current.onboardedAt ?? nowISO() },
  })
  await flushNow()
}

/** Days since the last backup (or since onboarding when there was never one). */
export function daysSinceBackup(profile: { lastBackupAt?: string; onboardedAt?: string }, now: Date = new Date()): number | undefined {
  const ref = profile.lastBackupAt ?? profile.onboardedAt
  if (!ref) return undefined
  return Math.floor((now.getTime() - new Date(ref).getTime()) / 86_400_000)
}
