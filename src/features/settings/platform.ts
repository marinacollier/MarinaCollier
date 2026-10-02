/** Browser / iOS platform helpers. Everything is defensive: no API is assumed to exist. */

export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export type PermissionState = 'unsupported' | NotificationPermission

export function notificationPermission(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode */
  }
}

/**
 * Save a file. On iPhone the share sheet ("Salvar em Arquivos") is the friendliest path,
 * elsewhere a regular download. Returns false if the person cancelled the share sheet.
 */
export async function saveFile(filename: string, content: string, type: string): Promise<boolean> {
  const blob = new Blob([content], { type })
  if (isIOS() && typeof navigator.share === 'function' && typeof File !== 'undefined') {
    const file = new File([blob], filename, { type })
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename })
        return true
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return false
      // fall through to a normal download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return true
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB`
}

export const APP_VERSION = '0.1.0'
