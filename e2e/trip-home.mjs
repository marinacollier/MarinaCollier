// The close trip on Home: expand, tick a to-do right there, reopen — still done, one less open.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4310'
const dir = new URL('./.profiles/profile-trip', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
const open = async () => {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'] })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => log('PAGEERROR', e.message))
  await page.goto(base + '/')
  await page.waitForTimeout(2500)
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.count()) { await enter.click(); await page.waitForTimeout(800) }
  return { ctx, page }
}
let { ctx, page } = await open()
const line = page.getByRole('button', { name: /South Africa 2026/ })
log('trip line:', await line.first().textContent())
await line.first().click()
await page.waitForTimeout(600)
const list = page.getByRole('list', { name: /Pendências de/ })
const labels = await list.locator('button[aria-label^="Concluir: "]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
log('open to-dos:', labels.length, '·', labels.slice(0, 4).join(' | '))
await list.screenshot({ path: shots + 'trip-home.png' }).catch(() => page.screenshot({ path: shots + 'trip-home.png' }))
await list.locator(`button[aria-label="${labels[0]}"]`).click()
await page.waitForTimeout(800)
await page.screenshot({ path: shots + 'trip-home-ticked.png' })
await ctx.close()
;({ ctx, page } = await open())
log('after reopen:', await page.getByRole('button', { name: /South Africa 2026/ }).first().textContent())
await page.getByRole('button', { name: /South Africa 2026/ }).first().click()
await page.waitForTimeout(500)
log('ticked one gone from open list:', (await page.locator(`button[aria-label="${labels[0]}"]`).count()) === 0)
await ctx.close()
