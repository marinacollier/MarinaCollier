// P0 importer, iPhone 13, NO clipboard API (as inside the Claude preview iframe / iOS): Home → "Importar JSON" →
// paste manually into the field → ONE button "Validar e ver prévia" → invalid JSON keeps text and says the line →
// valid → preview writes nothing → confirm → reopen → there → same JSON = nothing → done stays done.
// Prereq: npm run build && npx vite preview --port 4319 --strictPort
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4319'
const dir = new URL('./.profiles/profile-import-manual', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
const errors = []
const open = async () => {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'] })
  await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'clipboard', { value: undefined }) } catch {} })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base + '/'); await page.waitForTimeout(2500)
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.count()) { await enter.click(); await page.waitForTimeout(800) }
  return { ctx, page }
}
const stored = (page) => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('marina-os'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('db'); g.onsuccess = () => res(g.result) } }))
const doc = { schemaVersion: 'marina-os/changes@1', generatedAt: new Date().toISOString(), source: 'ChatGPT', changes: [{ op: 'create', type: 'task', sourceKey: 'e2e-manual-1', fields: { title: 'Tarefa importada manualmente (e2e)', date: new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }), priority: 'P2' } }] }
const json = JSON.stringify(doc, null, 2)

let { ctx, page } = await open()
log('clipboard api present:', await page.evaluate(() => !!navigator.clipboard))
await page.getByRole('button', { name: 'Importar JSON' }).click()
await page.waitForTimeout(1200)
log('url:', page.url().replace(base, ''))
const field = page.getByLabel('JSON para importar')
const btn = page.getByRole('button', { name: /prévia/i })
log('buttons that start the flow:', await btn.count(), '· disabled when empty:', await btn.first().isDisabled())
await page.screenshot({ path: shots + 'import-1-empty.png' })
// invalid
const bad = json.replace('"op": "create",', '"op": "create"')
await field.fill(bad)
await btn.first().click(); await page.waitForTimeout(400)
log('invalid →', await page.getByRole('alert').innerText(), '· text kept:', (await field.inputValue()) === bad)
await page.screenshot({ path: shots + 'import-2-invalid.png' })
// valid
await field.fill(json)
const before = JSON.stringify((await stored(page)).tasks)
await btn.first().click(); await page.waitForTimeout(800)
log('preview:', await page.getByTestId('changes-line').innerText())
log('preview wrote nothing:', JSON.stringify((await stored(page)).tasks) === before)
await page.screenshot({ path: shots + 'import-3-preview.png' })
await page.getByRole('button', { name: /^Confirmar \d+ mudanças?/ }).click(); await page.waitForTimeout(1200)
log('result:', await page.getByRole('status').first().innerText())
await ctx.close()
;({ ctx, page } = await open())
let db = await stored(page)
const t = db.tasks.find((x) => x.title === 'Tarefa importada manualmente (e2e)')
log('after reopen: task exists once:', db.tasks.filter((x) => x.title === t?.title).length === 1, '· on Home:', (await page.locator('main').innerText()).includes('Tarefa importada manualmente'))
// mark done on Home, then reimport
await page.locator('button[aria-label="Concluir: Tarefa importada manualmente (e2e)"]').first().click(); await page.waitForTimeout(800)
await page.goto(base + '/ajustes/dados?importar=1'); await page.waitForTimeout(1200)
await page.getByLabel('JSON para importar').fill(json)
await page.getByRole('button', { name: /prévia/i }).first().click(); await page.waitForTimeout(800)
log('reimport preview:', await page.getByTestId('changes-line').innerText(), '· confirm:', await page.getByRole('button', { name: /Confirmar|Nada a gravar/ }).first().innerText())
db = await stored(page)
log('still done:', db.tasks.find((x) => x.title === 'Tarefa importada manualmente (e2e)')?.status, '· copies:', db.tasks.filter((x) => x.title === 'Tarefa importada manualmente (e2e)').length)
log('page errors:', errors.length ? errors : 'none')
await ctx.close()
