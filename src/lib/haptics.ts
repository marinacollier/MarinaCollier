/**
 * Light tactile feedback.
 * - Android / Chrome: navigator.vibrate.
 * - iOS Safari (17.4+/18): has no vibrate API, but toggling an `<input type="checkbox" switch>`
 *   through its label triggers the system haptic. We keep one hidden switch for that.
 */
let iosSwitch: HTMLLabelElement | null = null

function ensureIOSSwitch(): HTMLLabelElement | null {
  if (typeof document === 'undefined') return null
  if (iosSwitch) return iosSwitch
  const label = document.createElement('label')
  label.setAttribute('aria-hidden', 'true')
  label.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-10px;top:-10px'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.tabIndex = -1
  label.appendChild(input)
  document.body.appendChild(label)
  iosSwitch = label
  return label
}

export function haptic(kind: 'light' | 'success' = 'light'): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(kind === 'success' ? [8, 40, 12] : 8)
      return
    }
    ensureIOSSwitch()?.click()
  } catch {
    /* feedback is a nicety, never an error */
  }
}
