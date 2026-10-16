// Sincronização 15/10 (iPhone 13, real browser, real IndexedDB):
// Home → linha "Sincronização 15/10 pronta para revisar" → Central com a prévia (nada gravado) → Confirmar
// → Home sem a linha → reabrir (persistiu, não volta a oferecer) → mesmo JSON de novo = nada a gravar.
// Pré-requisito: npm run build && npx vite preview --port 4317 --strictPort
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4317'
const dir = new URL('./.profiles/profile-sync-1015', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
const shot = (page, name) => page.screenshot({ path: `${shots}sync-${name}.png`, fullPage: false })
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
const diffKeys = (x, y) => Object.keys(x).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]))

let { ctx, page } = await open()

// 1. Home: one quiet line in the strip.
const line = page.getByRole('button', { name: /Sincronização 15\/10 pronta para revisar/ })
log('home offers the sync:', await line.count())
await shot(page, '1-home')
const before = await stored(page)

// 2. Tap → Central preloaded → preview (nothing written).
await line.click()
await page.waitForTimeout(1800)
log('url after tap:', page.url().replace(base, ''))
const syncText = await page.evaluate(() => window.history.state?.usr?.importText)
log('preloaded JSON:', typeof syncText === 'string' && syncText.includes('marina-os/changes@1'))
log('preview line:', await page.getByTestId('changes-line').innerText())
log('by type:', await page.getByTestId('changes-types').innerText())
await page.getByTestId('changes-line').scrollIntoViewIfNeeded()
await shot(page, '2-preview')
for (const n of [3, 4, 5]) {
  await page.evaluate(() => window.scrollBy(0, 700))
  await page.waitForTimeout(250)
  await shot(page, `${n}-preview-items`)
}
const changed = diffKeys(before, await stored(page))
log('preview wrote nothing to her records:', !changed.some((k) => k !== 'profile'), changed.length ? `(only: ${changed.join(', ')})` : '')

// 3. Confirm.
const confirm = page.getByRole('button', { name: /^Confirmar \d+ mudanças?/ })
log('confirm label:', await confirm.innerText())
await confirm.click()
await page.waitForTimeout(1500)
log('result:', await page.getByRole('status').first().innerText())
await page.getByRole('status').first().scrollIntoViewIfNeeded()
await shot(page, '6-done')

// 4. Home: the line is gone; today's items there.
await page.goto(base + '/')
await page.waitForTimeout(1500)
log('home still offers it:', await page.getByRole('button', { name: /Sincronização 15\/10/ }).count())
await shot(page, '7-home-after')
await page.evaluate(() => window.scrollBy(0, 600))
await page.waitForTimeout(250)
await shot(page, '8-home-after-scroll')
await ctx.close()

// 5. Reopen: persisted and never offered again.
;({ ctx, page } = await open())
const db = await stored(page)
log('persisted · syncsApplied:', JSON.stringify(db.profile.syncsApplied), '· project:', db.projects.some((p) => p.name === 'Pink Cheeks — Athenas Run Longer'), '· batches:', db.importBatches.filter((b) => b.kind === 'changes').length)
log('persisted · B.O.:', JSON.stringify(db.tasks.filter((t) => /B\.O/.test(t.title)).map((t) => [t.title, t.date, t.dueDate, t.status])))
log('persisted · received income:', db.expenses.filter((e) => e.status === 'received').length, '· done workouts:', JSON.stringify(db.workouts.filter((w) => w.status === 'feito').map((w) => [w.date, w.modality, w.distanceKm ?? null, w.durationMin ?? null])))
log('home offers it after reopen:', await page.getByRole('button', { name: /Sincronização 15\/10/ }).count())

// 6. Same JSON pasted again → nothing to write.
await page.goto(base + '/ajustes/dados?importar=1')
await page.waitForTimeout(1500)
await page.getByLabel('JSON para importar').fill(syncText)
await page.getByRole('button', { name: 'Validar e ver prévia', exact: true }).click()
await page.waitForTimeout(1200)
log('again:', await page.getByTestId('changes-line').innerText())
log('again button:', await page.getByRole('button', { name: /Confirmar|Nada a gravar/ }).first().innerText())
await page.getByTestId('changes-line').scrollIntoViewIfNeeded()
await shot(page, '9-again')
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
log('horizontal overflow:', overflow)
await ctx.close()
log('page errors:', errors.length ? errors : 'none')
