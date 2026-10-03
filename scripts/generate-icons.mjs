// Renders public/favicon.svg into the PNG icons used by the PWA manifest and iOS.
// Uses the Chromium that ships with Playwright: `npx playwright` must be resolvable.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const targets = [
  { file: 'apple-touch-icon.png', size: 180, pad: 0, square: true },
  { file: 'pwa-192.png', size: 192, pad: 0 },
  { file: 'pwa-512.png', size: 512, pad: 0 },
  { file: 'pwa-maskable-512.png', size: 512, pad: 0.12, square: true },
]

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const page = await browser.newPage()
for (const t of targets) {
  // Square variants drop the rounded corners: iOS and maskable icons get masked by the OS.
  const body = t.square ? svg.replace('rx="112"', 'rx="0"') : svg
  const inner = Math.round(t.size * (1 - t.pad * 2))
  await page.setViewportSize({ width: t.size, height: t.size })
  await page.setContent(
    `<html><body style="margin:0;background:#ECEBE4;display:grid;place-items:center;width:${t.size}px;height:${t.size}px">
      <div style="width:${inner}px;height:${inner}px">${body.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
    </body></html>`,
  )
  await page.screenshot({ path: `public/${t.file}`, omitBackground: !t.square })
  console.log('✓', t.file)
}
await browser.close()
