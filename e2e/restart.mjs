import { createRequire } from 'module'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4310'
const dir = new URL('./.profiles/profile-restart', import.meta.url).pathname
import('fs').then((fs) => fs.mkdirSync(new URL('./.shots/', import.meta.url).pathname, { recursive: true }))
const T0 = new Date('2026-10-09T09:30:00-03:00')
const log = (...a) => console.log(...a)

async function open(scheme = 'light') {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'], colorScheme: scheme })
  await ctx.clock.install({ time: T0 })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => log('PAGEERROR', e.message))
  return { ctx, page }
}
const readDB = (page) => page.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('marina-os')
  r.onerror = () => rej(r.error)
  r.onsuccess = () => { const tx = r.result.transaction('kv', 'readonly'); const g = tx.objectStore('kv').get('db'); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error) }
}))
async function ready(page) {
  await page.locator('[aria-label="Fala com a Lumos"]').or(page.getByRole('button', { name: /Entrar no meu dia/i })).first().waitFor({ timeout: 15000 })
  const btn = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(600) }
}
let n = 0
async function ask(page, text) {
  const box = page.getByLabel(/^Fal[ae] com a Lumos$/).last()
  await box.fill(text)
  await box.press('Enter')
  await page.waitForTimeout(900)
  await page.waitForFunction(() => !document.body.innerText.includes('Salvando no aparelho'), null, { timeout: 8000 })
  const body = await page.evaluate(() => document.body.innerText)
  if (body.includes('Não consegui salvar')) log('  !! SAVE FAILED after', text)
  const cards = await page.locator('.card').allInnerTexts()
  log(`  [${++n}] ${text}\n      → ${(cards.at(-1) ?? '').replace(/\s+/g, ' ').slice(0, 160)}`)
}

// ── Session 1 ──
const s1 = await open()
let page = s1.page
await page.goto(base + '/')
await ready(page)
log('SESSION 1 — Lumos')
for (const q of [
  'terminei a corrida',
  'preciso lembrar de revisar o deck do board',
  'essa tarefa já fiz',
  'recebi o Santander hoje',
  'terminei meu livro',
  'registra 30 min de inglês executivo hoje',
  'Fran ficou de me responder segunda',
  'FashionFinder é prioridade hoje',
  'minha fisioterapia hoje é 13h',
  'passa meu pedal de domingo pra sábado',
  'recebi 18.500 do Fashion Finder',
]) await ask(page, q)
// confirm the different amount
const confirm = page.getByRole('button', { name: /Confirmar R\$/ })
if (await confirm.count()) { await confirm.last().click(); await page.waitForTimeout(800); log('  confirmed 18.500') }
// a meal: needs a choice first (label or estimate), then saved
await ask(page, 'comi um yopro')
await page.getByRole('button', { name: /^estimativa/ }).last().click()
await page.getByRole('button', { name: 'Registrar agora' }).last().click()
await page.waitForTimeout(900)
log('  yopro logged as estimate:', (await page.locator('.card').last().innerText()).replace(/\s+/g, ' ').slice(0, 90))
// a win, by tapping the option
await ask(page, 'isso foi um baita resultado no FashionFinder')
const keep = page.getByRole('button', { name: /Registrar como win/ })
if (await keep.count()) { await keep.last().click(); await page.waitForTimeout(800); log('  win saved by tap') }

log('SESSION 1 — taps (Home → o dia inteiro: Milagre da Manhã)')
await page.getByRole('link', { name: 'Início' }).or(page.getByRole('button', { name: 'Início' })).first().click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: 'o dia inteiro' }).click()
await page.waitForTimeout(1000)
await page.getByRole('button', { name: /itens.*ver$/ }).first().click()
await page.waitForTimeout(800)
const morning = await page.locator('button[aria-label^="Ver passos"], button[aria-label^="Marcar "]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
log('  after unfolding the past:', morning.slice(0, 12).join(' · '))
const labels = await page.locator('button[aria-label^="Marcar "]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
log('  checkable:', labels.slice(0, 10).join(' · '))
for (const l of [...labels.filter((l) => /Higiene|Respira|Medita|Gratid|Água|Cama|Alonga|Leitura|Café/i.test(l)).slice(0, 2), ...labels.filter((l) => /Passeio manhã/.test(l))]) {
  await page.locator(`button[aria-label="${l}"]`).first().click()
  await page.waitForTimeout(400)
  log('  tapped', l)
}
await page.screenshot({ path: new URL('./.shots/dia-inteiro-s1.png', import.meta.url).pathname })
await page.waitForTimeout(600)
const before = await readDB(page)
await page.screenshot({ path: new URL('./.shots/agenda-s1.png', import.meta.url).pathname, fullPage: false })
await s1.ctx.close()
log('— app fully closed —')

const pick = (db) => ({
  doneTasks: db.tasks.filter((t) => t.status === 'done').map((t) => t.title).sort(),
  waiting: db.tasks.filter((t) => t.status === 'waiting').map((t) => [t.title, t.waiting?.followUpOn]),
  priorities: db.priorities.filter((p) => p.date === '2026-10-09').map((p) => [p.order, p.title]),
  workouts: db.workouts.filter((w) => w.date >= '2026-10-09' && w.date <= '2026-10-11').map((w) => [w.date, w.modality, w.status, w.time]),
  receivables: db.expenses.filter((e) => e.type === 'income' && e.period === '2026-10').map((e) => [e.title, e.status, e.expectedAmountCents, e.receivedAmountCents]),
  books: db.books.filter((b) => b.status === 'finalizado').map((b) => b.title),
  meals: db.meals.filter((m) => m.date === '2026-10-09').map((m) => m.description),
  english: db.tasks.filter((t) => t.careerKind === 'ingles_exec' && t.careerParentId).length + db.occurrences.filter((o) => o.parentId?.includes('ingles')).length,
  wins: db.wins.length,
  routineDone: db.occurrences.filter((o) => o.parentType === 'routineItem' && o.date === '2026-10-09').length,
  overrides: db.scheduleOverrides.filter((o) => o.date === '2026-10-09').map((o) => [o.refType, o.time]),
})
log('STATE after session 1:', JSON.stringify(pick(before), null, 1))

const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x))
const same = (label, db) => {
  const a = canon(before), b = canon(db)
  if (a === b) return log(`✓ ${label}: device state identical (${a.length} bytes)`)
  // Show which collections differ.
  const diff = Object.keys(before).filter((k) => canon(before[k]) !== canon(db[k]))
  log(`✗ ${label}: differs in ${diff.join(', ')}`)
  for (const k of diff.slice(0, 3)) {
    if (k === 'profile') for (const f of Object.keys({ ...before.profile, ...db.profile })) { if (JSON.stringify(before.profile[f]) !== JSON.stringify(db.profile[f])) log('    profile.' + f, JSON.stringify(before.profile[f]), '→', JSON.stringify(db.profile[f])) }
    else log('   ', k, JSON.stringify(before[k]).slice(0, 300), '\n    →', JSON.stringify(db[k]).slice(0, 300))
  }
}

// ── Reopen ──
const s2 = await open()
page = s2.page
await page.goto(base + '/')
await ready(page)
await page.waitForTimeout(1200)
same('close → reopen', await readDB(page))
const home = await page.evaluate(() => document.body.innerText)
log('  Home shows FashionFinder in Hoje importa:', /HOJE IMPORTA[\s\S]*FashionFinder/i.test(home))
await page.screenshot({ path: new URL('./.shots/home-reopen.png', import.meta.url).pathname })

// ── Reload ──
await page.reload()
await ready(page)
await page.waitForTimeout(1000)
same('reload', await readDB(page))

// ── New tab ──
const tab = await s2.ctx.newPage()
await tab.goto(base + '/agenda')
await tab.waitForTimeout(1800)
same('new tab', await readDB(tab))
const ag = await tab.evaluate(() => document.body.innerText)
log('  Agenda (new tab) shows Fisioterapia at 13:00:', /13:00[\s\S]{0,40}Fisioterapia/.test(ag))
await tab.close()
await s2.ctx.close()

// ── Restart the PWA offline (served by the service worker) ──
const s3 = await open()
page = s3.page
await s3.ctx.setOffline(true)
await page.goto(base + '/').catch((e) => log('offline goto error', e.message))
await ready(page)
await page.waitForTimeout(1200)
same('PWA restart (offline, from service worker)', await readDB(page))
await page.screenshot({ path: new URL('./.shots/home-offline.png', import.meta.url).pathname })
await s3.ctx.close()
