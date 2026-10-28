// Meu Universo (iPhone 13): open from Espaços, browse the tabs, add a diary entry, reload, confirm it persisted.
// Prereq: npx vite build && npx vite preview --port 4331 --strictPort. Screenshots → e2e/.shots/universo-*.png
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = process.env.BASE ?? 'http://localhost:4331'
const dir = new URL('./.profiles/profile-universo', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
const fail = (msg) => {
  log('FAIL', msg)
  process.exitCode = 1
}
const scheme = process.env.SCHEME ?? 'light'
const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'], colorScheme: scheme })
const page = ctx.pages()[0] ?? (await ctx.newPage())
page.on('pageerror', (e) => fail(`pageerror ${e.message}`))
const shot = (name) => page.screenshot({ path: `${shots}universo-${name}${scheme === 'dark' ? '-dark' : ''}.png`, fullPage: true })
const noHScroll = async (where) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (over > 1) fail(`horizontal scroll on ${where}: ${over}px`)
}

await page.goto(base + '/')
await page.waitForTimeout(2500)
const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
if (await enter.count()) {
  await enter.click()
  await page.waitForTimeout(800)
}

// Espaços → Meu Universo
await page.goto(base + '/espacos')
await page.waitForTimeout(1500)
const entry = page.getByRole('button', { name: /Meu Universo/ })
if (!(await entry.count())) fail('Meu Universo not in Espaços')
await entry.first().click()
await page.waitForTimeout(1500)
log('url', page.url())
await noHScroll('colecao')
await shot('colecao')
const cards = await page.locator('main .grid button.card').count()
log('collection cards:', cards)
if (cards < 30) fail('expected the seeded collection')
const body = await page.evaluate(() => document.querySelector('main').innerText)
if (body.includes('Very Sexy Night')) fail('wishlist item shown in the collection')

// Wishlist
await page.getByRole('tab', { name: 'Wishlist' }).click()
await page.waitForTimeout(700)
await noHScroll('wishlist')
await shot('wishlist')

// Comparar
await page.getByRole('tab', { name: 'Comparar' }).click()
await page.waitForTimeout(500)
const selects = page.locator('main select')
await selects.nth(0).selectOption({ label: 'YSL Libre Intense · tenho' })
await selects.nth(1).selectOption({ label: 'Dior Escale à Portofino · tenho' })
await page.waitForTimeout(500)
const cmp = await page.evaluate(() => document.querySelector('main').innerText)
if (!/Notas em comum: flor de laranjeira/.test(cmp)) fail('comparator shared notes')
await shot('comparar')

// Usar hoje
await page.getByRole('tab', { name: 'Usar hoje' }).click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Calor', exact: true }).click()
await page.getByRole('button', { name: 'Praia', exact: true }).click()
await page.waitForTimeout(600)
const wear = await page.evaluate(() => document.querySelector('main').innerText)
log('hoje →', wear.match(/HOJE[\s\S]{0,80}/i)?.[0].replace(/\s+/g, ' '))
if (!/Escale à Portofino/.test(wear)) fail('hot beach day should pick Escale à Portofino')
await noHScroll('hoje')
await shot('hoje')

// DNA & diário → new entry
await page.getByRole('tab', { name: 'DNA & diário' }).click()
await page.waitForTimeout(700)
await shot('dna')
await page.getByRole('button', { name: 'registrar', exact: true }).click()
await page.waitForTimeout(700)
await page.locator('[role=dialog] select').first().selectOption({ label: 'Lancôme La Nuit Trésor · tenho' })
await page.locator('[role=dialog]').getByRole('group', { name: 'Cidade' }).locator('input').fill('Stellenbosch')
await page.locator('[role=dialog]').getByRole('group', { name: 'Primeira impressão' }).locator('textarea').fill('Aconchegante, rosa escura')
await page.locator('[role=dialog]').getByRole('button', { name: 'Gostei', exact: true }).click()
await shot('diario-form')
await page.locator('[role=dialog]').getByRole('button', { name: 'Salvar' }).click()
await page.waitForTimeout(1200)

await page.reload()
await page.waitForTimeout(2500)
const after = await page.evaluate(() => document.querySelector('main').innerText)
if (!/stellenbosch/i.test(after) || !after.includes('Aconchegante, rosa escura')) fail('diary entry did not persist after reload')
else log('diary entry persisted after reload ✓')
await shot('diario-depois')
await ctx.close()
log(process.exitCode ? 'DONE with failures' : 'DONE ok')
