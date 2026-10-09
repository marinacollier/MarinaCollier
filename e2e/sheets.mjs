import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const dir = new URL('./', import.meta.url).pathname
const out = dir + '.shots/'
const files = fs.readdirSync(out).filter((f) => f.endsWith('.png')).sort()
const browser = await chromium.launch()
const p = await browser.newPage({ viewport: { width: 1600, height: 900 } })
for (let i = 0; i < files.length; i += 12) {
  const chunk = files.slice(i, i + 12)
  fs.writeFileSync(out + 'sheet.html', `<body style="margin:0;background:#888;font:13px sans-serif;display:grid;grid-template-columns:repeat(6,260px);gap:6px;padding:6px">${chunk.map((f) => `<figure style="margin:0"><img src="${f}" style="width:260px;display:block"><figcaption style="color:#fff">${f}</figcaption></figure>`).join('')}</body>`)
  await p.goto('file://' + out + 'sheet.html')
  await p.waitForTimeout(300)
  await p.screenshot({ path: `${dir}sheet-${String(i / 12).padStart(2, '0')}.png`, fullPage: true })
}
await browser.close()
