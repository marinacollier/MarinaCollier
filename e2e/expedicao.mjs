// Expedição África do Sul: the trip opens on "Hoje", the tabs render, an item edited in the sheet survives a
// full browser restart. Prerequisite: `npx vite build && npx vite preview --port 4330 --strictPort`.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = process.env.BASE ?? 'http://localhost:4330'
const dir = new URL('./.profiles/profile-expedicao', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
let failed = 0
const check = (ok, msg) => {
  log(ok ? '✓' : '✗', msg)
  if (!ok) failed++
}
const TRIP = '/viagens/trip-africa-do-sul'
const ADDRESS = 'Signal Hill Road, Cape Town'

const open = async () => {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'] })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => {
    log('PAGEERROR', e.message)
    failed++
  })
  await page.goto(base + '/')
  await page.waitForTimeout(2000)
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.count()) {
    await enter.click()
    await page.waitForTimeout(800)
  }
  await page.goto(base + TRIP)
  await page.waitForTimeout(1500)
  return { ctx, page }
}
const chip = (page, name) => page.locator('[aria-label="Seções da viagem"] button', { hasText: name }).first()

let { ctx, page } = await open()
// Hoje (default tab while the trip is happening)
const body = await page.locator('main, body').first().innerText()
check(/hoje em cape town|primeiro dia|último dia/i.test(body), 'Hoje dashboard opens by default')
check(/o dia/i.test(body), 'day timeline is there')
check(/(Aula|Dia livre|próxima saída)/i.test(body), 'classes / departures listed')
await page.screenshot({ path: shots + 'expedicao-hoje.png', fullPage: true })

for (const [name, file, re] of [
  ['Dias', 'dias', /semana 1/i],
  ['Pendências', 'pendencias', /liberação médica|conflitos/i],
  ['Custos', 'custos', /margem de 15%/i],
  ['Escola', 'escola', /preservadas/i],
  ['Checklists', 'checklists', /trilha|surf|voo|safári/i],
  ['Segurança', 'seguranca', /contatos de emergência/i],
]) {
  await chip(page, name).click()
  await page.waitForTimeout(700)
  const t = await page.locator('body').innerText()
  check(re.test(t), `${name} renders`)
  await page.screenshot({ path: shots + `expedicao-${file}.png`, fullPage: true })
}
const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
check(!hasHScroll, 'no horizontal scroll')

// Edit Lion's Head from the Dias timeline: address + uber.
await chip(page, 'Dias').click()
await page.waitForTimeout(700)
await page.getByRole('button', { name: /Lion's Head/ }).first().click()
await page.waitForTimeout(700)
const disclosure = page.getByRole('button', { name: /horários e deslocamento/i })
if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click()
await page.waitForTimeout(300)
await page.getByPlaceholder('Onde é').fill(ADDRESS)
const costs = page.getByRole('dialog').getByRole('button', { name: 'custos', exact: true }).or(page.locator('button[aria-expanded]', { hasText: /^custos$/ })).first()
if (await costs.getAttribute('aria-expanded') !== 'true') await costs.click()
await page.getByRole('textbox', { name: 'Uber', exact: true }).fill('85')
await page.screenshot({ path: shots + 'expedicao-sheet.png' })
await page.getByRole('button', { name: /^Salvar$/ }).click()
await page.waitForTimeout(1200)
await ctx.close()

;({ ctx, page } = await open())
await chip(page, 'Dias').click()
await page.waitForTimeout(700)
const after = await page.locator('body').innerText()
check(after.includes('Uber ZAR 85') || /Uber\s+ZAR\s*85/.test(after), 'Uber value persisted after restart')
await page.getByRole('button', { name: /Lion's Head/ }).first().click()
await page.waitForTimeout(700)
check((await page.getByPlaceholder('Onde é').inputValue()) === ADDRESS, 'address persisted after restart')
await page.screenshot({ path: shots + 'expedicao-after.png' })
await ctx.close()
log(failed ? `FAILED (${failed})` : 'ALL OK')
process.exit(failed ? 1 : 0)
