// Home command center in a real browser (iPhone 13): Hoje + Próximos, check in place, reopen, Lumos moves a task.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4310'
const dir = new URL('./.profiles/profile-home', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
const open = async (scheme = 'light') => {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'], colorScheme: scheme })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => log('PAGEERROR', e.message))
  await page.goto(base + '/')
  await page.waitForTimeout(2500)
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.count()) { await enter.click(); await page.waitForTimeout(800) }
  return { ctx, page }
}
let { ctx, page } = await open()
// Add tasks from several fronts through Lumos (the real pipeline).
for (const q of ['preciso responder a documentação do Santander', 'adiciona comprar ração da Luna']) {
  const box = page.getByLabel(/^Fal[ae] com a Lumos$/).last()
  await box.fill(q)
  await box.press('Enter')
  await page.waitForTimeout(1200)
}
await page.getByRole('button', { name: /fechar conversa/ }).click().catch(() => {})
await page.waitForTimeout(800)
const hoje = page.getByRole('region', { name: 'Hoje' }).or(page.locator('section[aria-label="Hoje"]')).first()
await hoje.scrollIntoViewIfNeeded()
await page.screenshot({ path: shots + 'home-hoje-light.png', fullPage: false })
const checks = await page.locator('section[aria-label="Hoje"] button[aria-pressed="false"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
log('checkable in Hoje:', checks.length, '·', checks.slice(0, 6).join(' | '))
const toTick = checks.filter((l) => !/^Comi/.test(l)).slice(0, 3)
for (const l of toTick) {
  await page.locator(`section[aria-label="Hoje"] button[aria-label="${l}"]`).first().click()
  await page.waitForTimeout(500)
  log('  ticked', l)
}
await page.locator('section[aria-label="Próximos"]').scrollIntoViewIfNeeded()
await page.screenshot({ path: shots + 'home-proximos-light.png' })
await ctx.close()

;({ ctx, page } = await open('dark'))
const fold = page.getByRole('button', { name: /^Feitos hoje · / })
log('folded:', await fold.first().textContent().catch(() => 'none'))
await fold.first().click()
await page.waitForTimeout(500)
const after = await page.locator('section[aria-label="Hoje"] button[aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
log('after reopen, done rows:', after.length)
for (const l of toTick) log(`  ${after.some((a) => a.includes(l.replace(/^.*?: /, '')) || a.endsWith(l.split(': ').pop())) ? '✓' : '✗'} still done: ${l}`)
await page.locator('section[aria-label="Hoje"]').scrollIntoViewIfNeeded()
await page.screenshot({ path: shots + 'home-hoje-dark.png' })
const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
log('horizontal overflow:', m.sw > m.cw + 1)
log('mic shown:', await page.getByLabel('Falar com a Lumos').count(), '· attach shown:', await page.getByLabel(/Anexar/).count())
await ctx.close()
