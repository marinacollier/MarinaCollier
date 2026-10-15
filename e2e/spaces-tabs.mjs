// Spaces check (iPhone 13): every space has ≤ 3 tabs and lists use the standard row. Screenshots → e2e/.shots/spaces-*.png
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = process.env.BASE ?? 'http://localhost:4312'
const dir = new URL('./.profiles/profile-spaces', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'] })
const page = ctx.pages()[0] ?? (await ctx.newPage())
page.on('pageerror', (e) => log('PAGEERROR', e.message))
await page.goto(base + '/')
await page.waitForTimeout(2500)
const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
if (await enter.count()) { await enter.click(); await page.waitForTimeout(800) }

const shot = async (name, path) => {
  if (path) { await page.goto(base + path); await page.waitForTimeout(1500) }
  const tabs = await page.locator('main [role=tablist] [role=tab]').allTextContents()
  log(name.padEnd(18), 'tabs:', tabs.length, tabs.join(' | '), '· rows:', await page.locator('main li').count())
  await page.screenshot({ path: `${shots}spaces-${name}.png`, fullPage: true })
}

await shot('ugc-hoje', '/trabalho/creator/ugc')
await shot('ugc-marcas', '/trabalho/creator/ugc?aba=marcas')
await shot('ugc-producao', '/trabalho/creator/ugc?aba=financeiro')
await shot('ugc-legacy-fu', '/trabalho/creator/ugc?aba=followups')
await shot('corpo', '/corpo')
await shot('corpo-progresso', '/corpo?aba=objetivos')
await shot('mealprep', '/meal-prep')
await shot('agenda', '/agenda')
await shot('biblia', '/biblia')
await shot('oracoes', '/biblia/oracoes')
await shot('tarefas', '/tarefas')
await shot('vida', '/vida')
await shot('vida-real', '/vida/real')
await shot('metas', '/metas')
await shot('creator', '/trabalho/creator')
await page.goto(base + '/trabalho'); await page.waitForTimeout(1500)
await shot('trabalho')
const proj = page.locator('a[href^="/trabalho/projeto/"]').first()
if (await proj.count()) { await proj.click(); await page.waitForTimeout(1500); await shot('projeto') ; await page.getByRole('tab', { name: 'Tarefas' }).click(); await page.waitForTimeout(800); await shot('projeto-tarefas') }
await page.goto(base + '/viagens'); await page.waitForTimeout(1500)
const trip = page.locator('a[href^="/viagens/"]').first()
if (await trip.count()) { await trip.click(); await page.waitForTimeout(1500); await shot('viagem'); await page.getByRole('tab', { name: 'Itens' }).click(); await page.waitForTimeout(800); await shot('viagem-itens') }
await ctx.close()
