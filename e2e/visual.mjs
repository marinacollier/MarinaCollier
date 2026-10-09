import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4310'
const out = new URL('./.shots/', import.meta.url).pathname
fs.mkdirSync(out, { recursive: true })
const routes = [
  ['home', '/'], ['lumos', '/lumos'], ['agenda', '/agenda'], ['espacos', '/espacos'], ['treino', '/corpo'],
  ['nutricao', '/nutricao'], ['dinheiro', '/dinheiro'], ['carreira', '/carreira'], ['revisao', '/carreira/revisao'],
  ['dados', '/ajustes/dados'], ['privacidade', '/ajustes/privacidade'],
]
const report = []
for (const scheme of ['light', 'dark']) {
  for (const prof of ['profile-restart', 'profile-fresh']) {
    if (prof === 'profile-fresh' && scheme === 'dark') continue
    const ctx = await chromium.launchPersistentContext(new URL('./.profiles/' + prof, import.meta.url).pathname, { ...devices['iPhone 13'], deviceScaleFactor: 1, colorScheme: scheme })
    // real clock: a fake clock freezes framer-motion entrance animations
    const page = ctx.pages()[0] ?? (await ctx.newPage())
    page.on('pageerror', (e) => report.push(`PAGEERROR ${prof} ${e.message}`))
    for (const [name, path] of routes) {
      await page.goto(base + path)
      await page.waitForTimeout(2600)
      const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
      if (await enter.count()) { await enter.click(); await page.waitForTimeout(500) }
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }))
      if (m.sw > m.cw + 1) report.push(`OVERFLOW-X ${scheme} ${prof} ${name}: ${m.sw} > ${m.cw}`)
      const tag = `${name}-${scheme}${prof === 'profile-fresh' ? '-empty' : ''}`
      await page.screenshot({ path: `${out}${tag}-1.png` })
      if (m.h > 900) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await page.waitForTimeout(1500)
        await page.screenshot({ path: `${out}${tag}-2.png` })
      }
    }
    if (prof === 'profile-restart') {
      // A sheet (receivable) and the keyboard (viewport shrinks like iOS when the keyboard opens).
      await page.goto(base + '/dinheiro'); await page.waitForTimeout(1000)
      const rec = page.getByText('Fashion Finder').first()
      if (await rec.count()) { await rec.click(); await page.waitForTimeout(700); await page.screenshot({ path: `${out}sheet-receivable-${scheme}-1.png` }) }
      await page.goto(base + '/'); await page.waitForTimeout(1000)
      await page.setViewportSize({ width: 390, height: 500 })
      await page.getByLabel(/^Fal[ae] com a Lumos$/).last().focus()
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${out}keyboard-${scheme}-1.png` })
      await page.setViewportSize({ width: 390, height: 664 })
    }
    await ctx.close()
  }
}
fs.writeFileSync(out + 'report.txt', report.join('\n'))
console.log(report.join('\n') || 'no overflow, no page errors')
