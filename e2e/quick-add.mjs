// "+" sem IA (iPhone 13, light + dark): progress line on Home, FAB, menu, short forms, keyboard, save → toast → Home,
// persistence across a full browser restart. Prereq: npm run build && npx vite preview --port 4315 --strictPort
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4315'
const shots = new URL('./.shots/', import.meta.url).pathname
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)

for (const scheme of ['light', 'dark']) {
  const dir = new URL(`./.profiles/quick-${scheme}`, import.meta.url).pathname
  fs.rmSync(dir, { recursive: true, force: true })
  const open = async () => {
    const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'], colorScheme: scheme })
    const page = ctx.pages()[0] ?? (await ctx.newPage())
    page.on('pageerror', (e) => log('PAGEERROR', e.message))
    await page.goto(base + '/'); await page.waitForTimeout(2500)
    const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
    if (await enter.count()) { await enter.click(); await page.waitForTimeout(900) }
    return { ctx, page }
  }
  const shot = (page, name, full = false) => page.screenshot({ path: `${shots}quick-${scheme}-${name}.png`, fullPage: full })
  let { ctx, page } = await open()
  const bar = page.getByRole('progressbar')
  log(scheme, 'progress', await bar.getAttribute('aria-label'))
  await shot(page, '1-home')
  const fab = page.getByRole('button', { name: 'Registrar algo' })
  const fb = await fab.boundingBox()
  log(scheme, 'fab box', JSON.stringify(fb))
  await fab.click(); await page.waitForTimeout(700)
  await shot(page, '2-menu')
  // Tarefa with keyboard: the primary button must stay on screen.
  await page.getByRole('button', { name: /^Tarefa/ }).click(); await page.waitForTimeout(500)
  await page.getByLabel('Título da tarefa').fill('Teste rápido sem IA')
  await shot(page, '3-tarefa')
  const save = page.getByRole('button', { name: 'Salvar tarefa' })
  const sb = await save.boundingBox()
  log(scheme, 'save btn in viewport', sb && sb.y + sb.height <= page.viewportSize().height, 'h', sb?.height)
  await save.click(); await page.waitForTimeout(900)
  await shot(page, '4-toast')
  log(scheme, 'home has task', (await page.locator('section[aria-label="Hoje"]').innerText()).includes('Teste rápido sem IA'))
  // Treino planejado em um toque
  await fab.click(); await page.waitForTimeout(500)
  await page.getByRole('button', { name: /^Treino feito/ }).click(); await page.waitForTimeout(500)
  await shot(page, '5-treino')
  const fiz = page.getByRole('button', { name: /^Fiz:/ }).first()
  if (await fiz.count()) { await fiz.click(); await page.waitForTimeout(900) }
  log(scheme, 'progress after treino', await bar.getAttribute('aria-label'))
  // Sono
  await fab.click(); await page.waitForTimeout(500)
  await page.getByRole('button', { name: /^Sono/ }).click(); await page.waitForTimeout(500)
  await page.getByRole('radio', { name: 'bom' }).click(); await page.waitForTimeout(400)
  await shot(page, '6-sono')
  await page.getByRole('button', { name: 'Salvar sono' }).click(); await page.waitForTimeout(700)
  // Despesa
  await fab.click(); await page.waitForTimeout(500)
  await page.getByRole('button', { name: /^Despesa/ }).click(); await page.waitForTimeout(500)
  await page.getByPlaceholder('0,00').fill('18,90')
  await shot(page, '7-despesa')
  await page.getByRole('button', { name: 'Salvar despesa' }).click(); await page.waitForTimeout(700)
  await page.mouse.wheel(0, 300); await page.waitForTimeout(300)
  await ctx.close()
  ;({ ctx, page } = await open())
  log(scheme, 'after restart: task', (await page.locator('main').innerText()).includes('Teste rápido sem IA'), '|', await page.getByRole('progressbar').getAttribute('aria-label'))
  await page.goto(base + '/corpo'); await page.waitForTimeout(1500)
  const hist = page.getByRole('tab', { name: /Histórico/i }).or(page.getByRole('button', { name: /^Histórico/i }))
  if (await hist.count()) { await hist.first().click(); await page.waitForTimeout(800) }
  await shot(page, '8-corpo-historico', true)
  const sw = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  log(scheme, 'horizontal scroll on corpo:', sw)
  await ctx.close()
}
