/** Clipboard helpers (iPhone Safari: both need the tap that triggers them). */

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for browsers without async clipboard permission.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** What is on the clipboard, or undefined when the browser doesn't allow reading it (she pastes by hand). */
export async function readClipboard(): Promise<string | undefined> {
  try {
    const t = await navigator.clipboard?.readText?.()
    return t?.trim() ? t : undefined
  } catch {
    return undefined
  }
}
