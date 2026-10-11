// UGC Business — Entrega 1 in a real browser (iPhone 13): Creator → UGC Business → add brand → tier →
// DM registered → follow-up date → reply via Lumos → "Responder" on the general Home → tick → reopen.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4310'
const dir = new URL('./.profiles/profile-ugc', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
const open = async (path = '/') => {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'] })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => log('PAGEERROR', e.message))
  await page.goto(base + '/')
  await page.waitForTimeout(2000)
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.count()) { await enter.click(); await page.waitForTimeout(800) }
  if (path !== '/') { await page.goto(base + path); await page.waitForTimeout(1500) }
  return { ctx, page }
}
const say = async (page, q) => {
  const box = page.getByLabel(/^Fal[ae] com a Lumos$/).last()
  await box.fill(q)
  await box.press('Enter')
  await page.waitForTimeout(1200)
}

let { ctx, page } = await open('/trabalho/creator')
log('creator entry:', (await page.getByRole('link', { name: /UGC Business/ }).first().textContent())?.trim())
await page.getByRole('link', { name: /UGC Business/ }).first().click()
await page.waitForTimeout(800)
await page.screenshot({ path: shots + 'ugc-agora-empty.png' })
// add a brand from the UGC space
await page.getByLabel('Nome da marca').first().fill('Ocean Drop')
await page.getByRole('button', { name: 'Adicionar' }).first().click()
await page.waitForTimeout(800)
log('brand page:', await page.locator('h1').first().textContent())
await page.getByRole('radio', { name: 'Tier A' }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: /^Mandei DM$/ }).click()
await page.waitForTimeout(600)
log('opportunity line:', (await page.getByRole('button', { name: /Ocean Drop · prospecção/ }).first().textContent())?.trim())
await page.screenshot({ path: shots + 'ugc-brand.png', fullPage: true })
await ctx.close()

;({ ctx, page } = await open('/trabalho/creator/ugc?aba=followups'))
log('follow-ups tab:', (await page.locator('main').innerText()).split('\n').filter((l) => /Ocean|follow-up/i.test(l)).slice(0, 3).join(' | '))
await page.goto(base + '/')
await page.waitForTimeout(1500)
await say(page, 'Ocean Drop respondeu')
log('lumos:', (await page.getByText(/Ocean Drop respondeu ✓/).first().textContent().catch(() => 'NO'))?.trim())
await page.getByRole('button', { name: /fechar conversa/ }).click().catch(() => {})
await page.waitForTimeout(600)
const hoje = page.locator('section[aria-label="Hoje"]')
log('Home shows Responder:', (await hoje.innerText()).includes('Responder Ocean Drop'))
await page.locator('section[aria-label="Hoje"] button[aria-label="Concluir: Responder Ocean Drop"]').click()
await page.waitForTimeout(700)
await ctx.close()

;({ ctx, page } = await open('/'))
const fold = page.getByRole('button', { name: /^Feitos hoje · / })
if (await fold.count()) await fold.first().click()
log('after reopen, Responder done:', (await page.locator('section[aria-label="Hoje"] button[aria-label="Desmarcar Responder Ocean Drop"]').count()) === 1)
await say(page, 'quem está esperando follow-up?')
log('lumos follow-ups:', (await page.getByText(/follow-up|Ninguém esperando/).first().textContent().catch(() => 'NO'))?.trim())
await page.goto(base + '/trabalho/creator/ugc')
await page.waitForTimeout(1200)
await page.screenshot({ path: shots + 'ugc-agora.png', fullPage: true })
const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
log('horizontal overflow:', m.sw > m.cw + 1)
await ctx.close()
