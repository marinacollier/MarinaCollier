/**
 * Lumos only says "feito" after the device holds the change.
 *
 *   write (in memory) → await persist() (save + read back) → confirm
 *                                  ↘ failed → roll the write back → persist again → "não consegui salvar"
 *
 * The write is applied in memory first so the screen can follow along; the confirmation waits for the
 * save. Without a device store (unit tests that never hydrate) there is nothing to wait for, so the
 * outcome is reported synchronously.
 */
import { hasStorage, persist } from '@/data/store'

const inflight = new Set<Promise<void>>()

/** Resolves when every pending Lumos save has settled (tests, E2E). */
export async function whenSaved(): Promise<void> {
  while (inflight.size) await Promise.all([...inflight])
}

export const SAVE_FAILED = 'Não consegui salvar no aparelho — nada foi alterado.'
export const SAVE_FAILED_SUB = 'Tenta de novo em instantes. Se continuar, gera um backup em Ajustes → Dados.'

/**
 * The write already happened in memory. Wait for the device; then `onSaved`, or `rollback` + `onFailed`.
 */
export function settle(onSaved: () => void, rollback: () => void, onFailed: () => void): void {
  if (!hasStorage()) return onSaved()
  const p: Promise<void> = persist()
    .then(async (r) => {
      if (r.ok) return onSaved()
      try {
        rollback()
      } finally {
        // Leave the device exactly as it was before the write (best effort; the store flags failures).
        await persist()
        onFailed()
      }
    })
    .finally(() => inflight.delete(p))
  inflight.add(p)
}

/** For cards that write on a tap: resolves true only once the device holds it (rolled back otherwise). */
export function saveConfirmed<T>(write: () => T, rollback: (value: T) => void): Promise<{ ok: true; value: T } | { ok: false }> {
  let value: T
  try {
    value = write()
  } catch {
    return Promise.resolve({ ok: false })
  }
  return new Promise((resolve) =>
    settle(
      () => resolve({ ok: true, value }),
      () => rollback(value),
      () => resolve({ ok: false }),
    ),
  )
}
