// 15/10 Bíblia check (iPhone 13): reconciliation card → Aplicar (persists after reload); study steps keep text +
// autosave survives reload; Importar estudo preview; weekly intention; light + dark screenshots.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4316'
const dir = new URL('./.profiles/profile-1015', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
const AMOS = '/biblia/estudo/' + encodeURIComponent('seed:biblia:profetas:amos-5')
const open = async (path, colorScheme = 'light') => {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'], colorScheme })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => log('PAGEERROR', e.message))
  await page.goto(base + '/'); await page.waitForTimeout(2000)
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.count()) { await enter.click(); await page.waitForTimeout(800) }
  if (path) { await page.goto(base + path); await page.waitForTimeout(1200) }
  return { ctx, page }
}
const text = async (page) => (await page.locator('main').innerText()).replace(/\n+/g, ' | ')

let { ctx, page } = await open('/biblia')
log('card:', (await text(page)).slice(0, 600))
await page.screenshot({ path: shots + 'b1015-card-light.png', fullPage: true })
await page.getByRole('button', { name: 'Aplicar', exact: true }).click(); await page.waitForTimeout(800)
await page.getByLabel('Nova intenção de oração').fill('Pela paz em casa')
await page.getByRole('button', { name: 'Guardar' }).click(); await page.waitForTimeout(600)
await page.screenshot({ path: shots + 'b1015-after-light.png', fullPage: true })
await ctx.close()

;({ ctx, page } = await open(AMOS))
log('amos header:', (await text(page)).slice(0, 200))
await page.getByRole('tab', { name: 'Refletir' }).click()
await page.getByLabel('Escrita livre').fill('Que a justiça corra como as águas.')
await page.getByRole('tab', { name: 'Orar' }).click()
await page.getByRole('textbox', { name: 'Sua oração' }).fill('Senhor, ensina-me a justiça.')
await page.getByRole('tab', { name: 'Refletir' }).click()
log('kept after switch:', await page.getByLabel('Escrita livre').inputValue())
await page.waitForTimeout(1500)
log('indicator:', await page.locator('[aria-live="polite"]').first().innerText())
await page.screenshot({ path: shots + 'b1015-refletir-light.png', fullPage: true })
await ctx.close()

;({ ctx, page } = await open(AMOS, 'dark'))
await page.getByRole('tab', { name: 'Refletir' }).click()
log('persisted after reload:', await page.getByLabel('Escrita livre').inputValue(), '| status:', (await text(page)).match(/concluído[^|]*/)?.[0])
await page.screenshot({ path: shots + 'b1015-refletir-dark.png', fullPage: true })
await page.goto(base + '/biblia/importar?estudo=' + encodeURIComponent('seed:biblia:profetas:amos-5')); await page.waitForTimeout(1000)
await page.getByRole('textbox', { name: 'JSON do estudo' }).fill(JSON.stringify({ resumo: 'Deus rejeita o culto sem justiça.', reflexoes: { pessoal: 'Outro texto.' }, palavraChave: 'Justiça' }))
await page.getByRole('button', { name: 'Revisar' }).click(); await page.waitForTimeout(600)
log('import preview:', (await text(page)).slice(0, 500))
await page.screenshot({ path: shots + 'b1015-import-dark.png', fullPage: true })
await page.goto(base + '/biblia'); await page.waitForTimeout(1000)
log('biblia after:', (await text(page)).slice(0, 700))
await page.screenshot({ path: shots + 'b1015-biblia-dark.png', fullPage: true })
await page.goto(base + '/biblia/marcar'); await page.waitForTimeout(800)
await page.screenshot({ path: shots + 'b1015-marcar-dark.png', fullPage: true })
await ctx.close()
