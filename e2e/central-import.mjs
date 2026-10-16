// Central de importação + ChatGPT round trip (iPhone 13, real browser, real IndexedDB):
// Dados → copiar contexto → "ChatGPT" edita usando os ids → Home "Colar e importar JSON" → prévia (nada gravado)
// → confirmar → reabrir o app (persistiu) → mesmo JSON de novo = nada muda → cópia automática listada.
// Pré-requisito: npm run build && npx vite preview --port 4314 --strictPort
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4314'
const dir = new URL('./.profiles/profile-central', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
const shot = (page, name) => page.screenshot({ path: `${shots}central-${name}.png`, fullPage: false })
const errors = []

const open = async () => {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base + '/')
  await page.waitForTimeout(2500)
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.count()) {
    await enter.click()
    await page.waitForTimeout(800)
  }
  return { ctx, page }
}
const stored = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open('marina-os')
        r.onsuccess = () => {
          const g = r.result.transaction('kv').objectStore('kv').get('db')
          g.onsuccess = () => resolve(g.result)
        }
      }),
  )

let { ctx, page } = await open()

// 1. Dados → ChatGPT → copiar contexto.
await page.goto(base + '/ajustes/dados')
await page.waitForTimeout(1200)
await page.getByText('Copiar contexto para ChatGPT').scrollIntoViewIfNeeded()
await shot(page, '1-chatgpt')
await page.getByRole('button', { name: 'Copiar contexto para ChatGPT' }).click()
await page.waitForTimeout(400)
const context = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))
log('context schema:', context.schemaVersion, '· modules:', Object.keys(context.modules).join(','), '· excluded:', context.excluded.length)
log('no notes/amounts by default:', !/"notes"|"amountCents"/.test(JSON.stringify(context.modules)))
const todo = context.modules.tasks.filter((t) => t.status === 'todo')
const [a, b] = todo
const w = context.modules.workouts.find((x) => x.status === 'planejado')

// 2. What ChatGPT answers (only with the ids it was given).
const reply = {
  schemaVersion: 'marina-os/changes@1',
  generatedAt: new Date().toISOString(),
  source: 'ChatGPT',
  changes: [
    { op: 'complete', type: 'task', id: a.id, baseVersion: a.version },
    { op: 'move', type: 'task', id: b.id, baseVersion: b.version, fields: { date: '2026-10-19' } },
    { op: 'move', type: 'plannedWorkout', id: w.id, baseVersion: w.version, fields: { time: '06:10' } },
    { op: 'create', type: 'task', sourceKey: 'e2e-orcamento', fields: { title: 'Revisar orçamento do mês (e2e)', date: context.today, priority: 'P2' } },
    { op: 'create', type: 'backlog', sourceKey: 'e2e-passaporte', fields: { title: 'Renovar passaporte (e2e)', from: '2026-11-01' } },
    { op: 'delete', type: 'task', id: todo[2].id },
    { op: 'create', type: 'book', fields: { title: 'Duna' } },
  ],
}
const replyText = 'Claro! Aqui está:\n```json\n' + JSON.stringify(reply, null, 2) + '\n```'
await page.evaluate((t) => navigator.clipboard.writeText(t), replyText)

// 3. Home → "Colar e importar JSON" (1 toque) → prévia.
await page.goto(base + '/')
await page.waitForTimeout(1500)
const before = await stored(page)
const diffKeys = (x, y) => Object.keys(x).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]))
await page.getByRole('button', { name: 'Colar e importar JSON' }).click()
await page.waitForTimeout(1500)
log('url after tap:', page.url().replace(base, ''))
const line = await page.getByTestId('changes-line').innerText()
log('preview line:', line)
await page.getByTestId('changes-line').scrollIntoViewIfNeeded()
await shot(page, '2-preview')
await page.evaluate(() => window.scrollBy(0, 560))
await page.waitForTimeout(300)
await shot(page, '3-preview-items')
await page.evaluate(() => window.scrollBy(0, 560))
await page.waitForTimeout(300)
await shot(page, '3b-preview-items')
const changed = diffKeys(before, await stored(page))
log('preview wrote nothing to her records:', !changed.some((k) => k !== 'profile'), changed.length ? `(only: ${changed.join(', ')})` : '')

// 4. Confirm.
const confirm = page.getByRole('button', { name: /^Confirmar \d+ mudanças?/ })
log('confirm label:', await confirm.innerText())
await confirm.click()
await page.waitForTimeout(1200)
const status = await page.getByRole('status').first().innerText()
log('result:', status)
await page.getByRole('status').first().scrollIntoViewIfNeeded()
await shot(page, '4-done')
await ctx.close()

// 5. Reopen the app: everything is there.
;({ ctx, page } = await open())
const db = await stored(page)
const t = (id) => db.tasks.find((x) => x.id === id)
log('persisted · complete:', t(a.id)?.status, '· moved:', t(b.id)?.date, '· workout time:', db.workouts.find((x) => x.id === w.id)?.time)
log('persisted · created task:', db.tasks.filter((x) => x.title === 'Revisar orçamento do mês (e2e)').length, '· backlog:', db.backlogItems.filter((x) => x.title === 'Renovar passaporte (e2e)').length)
log('delete without opt-in kept the task:', !!t(todo[2].id))
const hoje = await page.locator('main').innerText()
log('home shows the new task:', hoje.includes('Revisar orçamento do mês (e2e)'))

// 6. Same JSON again → nothing to write.
await page.evaluate((t) => navigator.clipboard.writeText(t), replyText)
await page.getByRole('button', { name: 'Colar e importar JSON' }).click()
await page.waitForTimeout(1500)
log('again:', await page.getByTestId('changes-line').innerText())
log('again button:', await page.getByRole('button', { name: /Confirmar|Nada a gravar/ }).first().innerText())
await page.getByRole('button', { name: 'Cancelar' }).first().click()

// 7. Backup + automatic copies section.
await page.getByText('Cópias automáticas').scrollIntoViewIfNeeded()
await shot(page, '5-snapshots')
const bodyText = await page.locator('main').innerText()
log('snapshot listed:', /antes de importar/.test(bodyText), '· backup reminder:', /Nenhum backup ainda|Faz \d+ dias/.test(bodyText))
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
log('horizontal overflow:', overflow)
log('page errors:', errors.length ? errors : 'none')
await ctx.close()
