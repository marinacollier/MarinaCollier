// Lumos as a bottom sheet (iPhone 13): Home doesn't move; answers slide up; a direct action folds into a toast.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = process.env.BASE ?? 'http://localhost:4313'
const dir = new URL('./.profiles/profile-lumos-sheet', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
const log = (...a) => console.log(...a)
const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'] })
const page = ctx.pages()[0] ?? (await ctx.newPage())
page.on('pageerror', (e) => log('PAGEERROR', e.message))
await page.goto(base + '/'); await page.waitForTimeout(2500)
const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
if (await enter.count()) { await enter.click(); await page.waitForTimeout(1000) }
const shot = (n) => page.screenshot({ path: `e2e/.shots/lumos-sheet-${n}.png` })
const box = page.getByLabel('Fala com a Lumos')
const y = async () => (await page.locator('section[aria-label="Lumos"]').boundingBox())?.y
await shot('0-home')
const y0 = await y()
const sheet = page.getByRole('dialog', { name: 'Conversa com a Lumos' })

for (const [i, q] of [['1', 'gera um email pra Breevo'], ['2', 'quais marcas têm maior potencial?']]) {
  // the second one goes through the sheet's own composer (follow-up)
  if (i === '1') { await box.fill(q); await page.getByLabel('Enviar para a Lumos').click() }
  else { await sheet.getByLabel('Fale com a Lumos').fill(q); await sheet.getByLabel('Enviar', { exact: true }).click() }
  await page.waitForTimeout(1200)
  log(q, '→ sheet open:', await sheet.count(), '| home moved:', (await y()) !== y0)
  log('  ', (await sheet.innerText()).split('\n').slice(-14).join(' | ').slice(0, 500))
  await shot(`${i}-sheet`)
  await page.waitForTimeout(3000)
  log('   still open after 3s:', await sheet.count())
}
// close, then a direct action from Home → folds into a toast
await sheet.getByLabel('Fechar conversa').click(); await page.waitForTimeout(600)
await box.fill('preciso lembrar de comprar ração da Luna'); await page.getByLabel('Enviar para a Lumos').click()
await page.waitForTimeout(1000)
log('direct → sheet open:', await sheet.count(), (await sheet.innerText().catch(() => '')).split('\n').slice(-6).join(' | '))
await shot('3-direct')
await page.waitForTimeout(2600)
log('after 2.6s sheet open:', await sheet.count(), '| toast:', await page.locator('[aria-live="polite"]').last().innerText())
await shot('4-toast')
await ctx.close()
