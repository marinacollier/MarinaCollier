// P0 importer, iPhone 13, NO clipboard API (as inside the Claude preview iframe / iOS): Home → "Importar JSON" →
// paste manually into the field → ONE button "Validar e ver prévia" → invalid JSON keeps text and says the line →
// valid → preview writes nothing → confirm → reopen → there → same JSON = nothing → done stays done.
// Prereq: npm run build && npx vite preview --port 4319 --strictPort
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = process.env.E2E_BASE ?? 'http://localhost:4319'
const ok = (cond, what) => { if (!cond) { console.error('FALHOU:', what); process.exitCode = 1 } }
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
ok(!(await page.evaluate(() => !!navigator.clipboard)), 'clipboard API should be absent in this run')
await page.getByRole('button', { name: 'Importar JSON' }).click()
await page.waitForTimeout(1200)
log('url:', page.url().replace(base, ''))
const field = page.getByLabel('JSON para importar')
const btn = page.getByRole('button', { name: /prévia/i })
ok((await btn.count()) === 1, 'exactly one button starts the import'); ok(await btn.first().isDisabled(), 'button disabled when empty')
await page.screenshot({ path: shots + 'import-1-empty.png' })
// invalid
const bad = json.replace('"op": "create",', '"op": "create"')
await field.fill(bad)
await btn.first().click(); await page.waitForTimeout(400)
ok(/linha \d+/.test(await page.getByRole('alert').innerText()), 'invalid JSON names the line'); ok((await field.inputValue()) === bad, 'invalid text kept')
await page.screenshot({ path: shots + 'import-2-invalid.png' })
// valid
await field.fill(json)
const before = JSON.stringify((await stored(page)).tasks)
await btn.first().click(); await page.waitForTimeout(800)
log('preview:', await page.getByTestId('changes-line').innerText())
ok(JSON.stringify((await stored(page)).tasks) === before, 'preview writes nothing')
await page.screenshot({ path: shots + 'import-3-preview.png' })
await page.getByRole('button', { name: /^Confirmar \d+ mudanças?/ }).click(); await page.waitForTimeout(1200)
log('result:', await page.getByRole('status').first().innerText())
await ctx.close()
;({ ctx, page } = await open())
let db = await stored(page)
const t = db.tasks.find((x) => x.title === 'Tarefa importada manualmente (e2e)')
ok(!!t && db.tasks.filter((x) => x.title === t.title).length === 1, 'task persisted once after reopen'); ok((await page.locator('main').innerText()).includes('Tarefa importada manualmente'), 'task on Home')
// mark done on Home, then reimport
await page.locator('button[aria-label="Concluir: Tarefa importada manualmente (e2e)"]').first().click(); await page.waitForTimeout(800)
await page.goto(base + '/ajustes/dados?importar=1'); await page.waitForTimeout(1200)
await page.getByLabel('JSON para importar').fill(json)
await page.getByRole('button', { name: /prévia/i }).first().click(); await page.waitForTimeout(800)
log('reimport preview:', await page.getByTestId('changes-line').innerText(), '· confirm:', await page.getByRole('button', { name: /Confirmar|Nada a gravar/ }).first().innerText())
db = await stored(page)
ok(db.tasks.find((x) => x.title === 'Tarefa importada manualmente (e2e)')?.status === 'done', 'reimport keeps done'); ok(db.tasks.filter((x) => x.title === 'Tarefa importada manualmente (e2e)').length === 1, 'reimport no duplicate')
ok(!errors.length, 'no page errors: ' + errors.join(' | '))
console.log(process.exitCode ? 'IMPORTADOR: FALHOU' : 'IMPORTADOR: OK')
await ctx.close()
