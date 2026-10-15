// Home simplificada (iPhone 13): Início + folha de edição rápida. Uso: node e2e/home-simple.mjs <tag> [port]
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const tag = process.argv[2] ?? 'after'
const base = `http://localhost:${process.argv[3] ?? 4311}`
const dir = new URL(`./.profiles/profile-home-${tag}`, import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync('e2e/.shots', { recursive: true })
const log = (...a) => console.log(...a)
const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'] })
const page = ctx.pages()[0] ?? (await ctx.newPage())
page.on('pageerror', (e) => log('PAGEERROR', e.message))
await page.goto(base + '/')
await page.waitForTimeout(2500)
const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
if (await enter.count()) {
  await enter.click()
  await page.waitForTimeout(1200)
}
await page.screenshot({ path: `e2e/.shots/home-${tag}-top.png` })
await page.screenshot({ path: `e2e/.shots/home-${tag}-full.png`, fullPage: true })
if (tag !== 'before') {
  const hoje = page.locator('section[aria-label="Hoje"]')
  log('hoje rows:', await hoje.locator('li').count())
  log('hoje text:', (await hoje.innerText()).split('\n').slice(0, 40).join(' | '))
  // tap the first row body (not the check) → quick edit sheet
  await hoje.locator('li', { hasText: 'ficou de' }).first().locator('button:not([role="checkbox"])').click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `e2e/.shots/home-${tag}-sheet.png` })
  const dlg = page.locator('[role="dialog"]').last()
  log('sheet:', (await dlg.innerText()).split('\n').slice(0, 24).join(' | '))
  const obs = dlg.getByRole('textbox', { name: 'Obs' })
  if (await obs.count()) {
    await obs.fill('levar carregador')
    await dlg.getByRole('button', { name: 'Salvar' }).click()
    await page.waitForTimeout(700)
  }
  log('after save body has Desfazer:', (await page.locator('body').innerText()).includes('Desfazer'))
  await page.waitForTimeout(4500)
  // check the first open row, then open "Feitos hoje"
  await hoje.locator('button[role="checkbox"][aria-checked="false"]').first().click()
  await page.waitForTimeout(700)
  const feitos = page.getByRole('button', { name: /Feitos hoje/ })
  if (await feitos.count()) {
    await feitos.click()
    await page.waitForTimeout(400)
  }
  const amanha = page.locator('section[aria-label="Próximos dias"] button[aria-expanded]').first()
  if (await amanha.count()) {
    await amanha.click()
    await page.waitForTimeout(400)
  }
  await page.screenshot({ path: `e2e/.shots/home-${tag}-full2.png`, fullPage: true })
  await hoje.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, 1500))
  await page.screenshot({ path: `e2e/.shots/home-${tag}-mid.png` })
  await page.locator('section[aria-label="Próximos dias"]').screenshot({ path: `e2e/.shots/home-${tag}-next.png` })
  const routine = hoje.locator('li', { hasText: /\d+\/\d+/ }).first()
  if (await routine.count()) {
    await routine.locator('button:not([role="checkbox"])').first().click()
    await page.waitForTimeout(900)
    await page.screenshot({ path: `e2e/.shots/home-${tag}-routine.png` })
  }
}
await ctx.close()
