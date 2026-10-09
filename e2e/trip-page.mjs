// Trip page: every line has a check (flights/stays too), one tap, persists after reopening.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4310'
const dir = new URL('./.profiles/profile-trippage', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
const path = process.argv[2]
const open = async () => {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'] })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => log('PAGEERROR', e.message))
  await page.goto(base + '/')
  await page.waitForTimeout(2000)
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.count()) { await enter.click(); await page.waitForTimeout(800) }
  await page.goto(base + path)
  await page.waitForTimeout(1500)
  return { ctx, page }
}
let { ctx, page } = await open()
const tabs = await page.getByRole('tab').or(page.locator('[role=tablist] button')).allTextContents().catch(() => [])
log('tabs:', tabs.join(' | '))
for (const name of ['Hospedagem', 'Voos', 'Reservas', 'Roteiro']) {
  const t = page.getByRole('button', { name: new RegExp(`^${name}`) }).first()
  if (await t.count()) { await t.click(); await page.waitForTimeout(600); log('opened tab', name); break }
}
const boxes = page.getByRole('checkbox')
const n = await boxes.count()
log('checkboxes on tab:', n)
await page.screenshot({ path: shots + 'trip-page.png' })
const first = boxes.first()
const label = await first.getAttribute('aria-label')
await first.click()
await page.waitForTimeout(800)
log('ticked:', label, '→', await first.getAttribute('aria-checked') ?? await first.isChecked().catch(() => '?'))
await page.screenshot({ path: shots + 'trip-page-ticked.png' })
await ctx.close()
;({ ctx, page } = await open())
for (const name of ['Hospedagem', 'Voos', 'Reservas', 'Roteiro']) {
  const t = page.getByRole('button', { name: new RegExp(`^${name}`) }).first()
  if (await t.count()) { await t.click(); await page.waitForTimeout(600); break }
}
const again = page.getByRole('checkbox', { name: label })
log('after reopen still checked:', await again.first().getAttribute('aria-checked') ?? await again.first().isChecked().catch(() => '?'))
await ctx.close()
