// Calendário universal (/agenda) no navegador: iPhone 13 e iPad, claro e escuro.
// Abre 09/11 e vê aula + caiaque no mesmo lugar, troca Dia/Semana/Mês/Lista, abre o detalhe (sem formulário),
// filtra Viagem e volta pra Tudo, edita um compromisso por "Editar", recarrega e confere que ficou salvo.
// Run: npx vite build && npx vite preview --port 4380 --strictPort &
//      PLAYWRIGHT_BROWSERS_PATH=… BASE=http://localhost:4380 node e2e/calendario.mjs
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = process.env.BASE ?? 'http://localhost:4380'
const shots = new URL('./.shots/', import.meta.url).pathname
fs.mkdirSync(shots, { recursive: true })

let failures = 0
const ok = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`)
  if (!cond) failures++
}

// Her records after the 06/11 update (same ids): caiaque on Monday 09/11 13:00–15:00, Garden Route out of the week.
async function apply1106(page) {
  await page.evaluate(async () => {
    const idb = await new Promise((res, rej) => {
      const r = indexedDB.open('marina-os')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = (mode) => idb.transaction('kv', mode).objectStore('kv')
    const db = await new Promise((res) => {
      const r = tx('readonly').get('db')
      r.onsuccess = () => res(r.result)
    })
    const ZA = 'seed:travel:za-'
    const out = ['garden-route-1', 'garden-route-hosp', 'tsitsikamma', 'garden-route-volta', 'bloukrans'].map((s) => ZA + s)
    db.tripItems = db.tripItems.map((i) => {
      if (i.id === ZA + 'caiaque')
        return { ...i, title: 'Caiaque com focas — Hout Bay (Kayak Adventures)', status: 'a_confirmar', optional: false, date: '2026-11-09', time: '13:00', endTime: '15:00', schoolImpact: 'parcial', certainty: 'pendente', bookingStatus: 'aguardando_resposta', supplier: 'Kayak Adventures', nextAction: 'Aguardar a confirmação do grupo mínimo', caveat: 'Operador exige mínimo de 4 participantes; grupo ainda não confirmado.' }
      if (out.includes(i.id)) {
        const { date, endDate, time, endTime, schoolImpact, ...rest } = i
        return { ...rest, optional: true, bookingStatus: 'opcional', status: 'a_confirmar' }
      }
      return i
    })
    await new Promise((res, rej) => {
      const r = tx('readwrite').put(db, 'db')
      r.onsuccess = () => res()
      r.onerror = () => rej(r.error)
    })
  })
}

async function noHorizontalScroll(page, where) {
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  ok(w.sw <= w.cw + 1, `${where}: sem rolagem horizontal (${w.sw}/${w.cw})`)
}

const tab = (page, name) => page.getByRole('tab', { name, exact: true }).click()
const detail = (page) => page.getByRole('article', { name: /^Detalhe:/ })

async function run(label, device, opts) {
  const dir = new URL(`./.profiles/profile-calendario-${label}`, import.meta.url).pathname
  fs.rmSync(dir, { recursive: true, force: true })
  const ctx = await chromium.launchPersistentContext(dir, { ...device, colorScheme: 'light', timezoneId: opts.tz })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => {
    failures++
    console.log('PAGEERROR', e.message)
  })
  await page.goto(base + '/')
  await page.waitForTimeout(2500)
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.count()) {
    await enter.click()
    await page.waitForTimeout(800)
  }
  await page.waitForTimeout(1200)
  await apply1106(page)
  await page.goto(base + '/agenda?d=2026-11-09')
  await page.waitForTimeout(1500)

  console.log(`\n— ${label} (${device.viewport.width}×${device.viewport.height}, fuso ${opts.tz})`)
  const day = page.getByLabel('Dia 2026-11-09')
  const dayText = (await day.textContent()) ?? ''
  ok(/Aula · Bayswater Cape Town/.test(dayText), 'Dia 09/11: aula (Bayswater)')
  ok(/Caiaque com focas — Hout Bay/.test(dayText), 'Dia 09/11: caiaque')
  const kayak = page.locator('[data-entry="tripItem:seed:travel:za-caiaque"]')
  ok(/13:00–15:00/.test((await kayak.textContent()) ?? '') && /pendente/.test((await kayak.getAttribute('aria-label')) ?? ''), 'caiaque 13:00–15:00, pendente')
  ok(/Prazo: Confirmar transfer do safári/.test(dayText), 'prazo de tarefa no mesmo dia')
  if (opts.tz !== 'Africa/Johannesburg') ok(/horário de Cape Town/.test(dayText), 'nota de fuso (horário de Cape Town)')
  await noHorizontalScroll(page, 'Dia')
  await page.screenshot({ path: `${shots}calendario-${label}-dia.png`, fullPage: false })

  for (const [name, file] of [['Semana', 'semana'], ['Mês', 'mes'], ['Lista', 'lista']]) {
    await page.evaluate(() => window.scrollTo(0, 0))
    await tab(page, name)
    await page.waitForTimeout(500)
    const n = await page.locator('main').getByText(/Caiaque com focas/).count()
    ok(n >= 1, `${name}: caiaque visível`)
    await noHorizontalScroll(page, name)
    await page.screenshot({ path: `${shots}calendario-${label}-${file}.png`, fullPage: false })
  }
  await tab(page, 'Dia')
  await page.waitForTimeout(400)

  // Detail first: no form.
  await page.locator('[data-entry="tripItem:seed:travel:za-caiaque"]').first().click()
  await page.waitForTimeout(500)
  const d = detail(page)
  const dt = (await d.textContent()) ?? ''
  ok(/Caiaque com focas/.test(dt) && /pendente/.test(dt) && /Próxima ação/.test(dt), 'detalhe: o que, status, próxima ação')
  ok(/Abrir em Viagem/.test(dt) && /Editar/.test(dt), 'detalhe: Abrir em módulo + Editar')
  ok((await d.locator('input, textarea, select').count()) === 0, 'detalhe: nenhum formulário aberto')
  ok((await page.locator('input:visible, textarea:visible').count()) === 0, 'nenhum campo de formulário visível na tela')
  await page.screenshot({ path: `${shots}calendario-${label}-detalhe.png` })
  await page.getByRole('button', { name: 'Fechar detalhe' }).click()
  await page.waitForTimeout(400)

  // Filter: Viagem only, then Tudo. The choice is remembered on this device.
  await page.getByRole('group', { name: 'Filtrar por categoria' }).getByRole('button', { name: 'Viagem', exact: true }).click()
  await page.waitForTimeout(300)
  let t = (await day.textContent()) ?? ''
  ok(/Caiaque/.test(t) && !/Aula · Bayswater/.test(t), 'filtro Viagem: caiaque sim, aula (estudo) não')
  await page.reload()
  await page.waitForTimeout(1500)
  t = (await page.getByLabel('Dia 2026-11-09').textContent()) ?? ''
  ok(!/Aula · Bayswater/.test(t), 'filtro lembrado depois de recarregar')
  await page.getByRole('group', { name: 'Filtrar por categoria' }).getByRole('button', { name: 'Tudo', exact: true }).click()
  await page.waitForTimeout(300)
  t = (await page.getByLabel('Dia 2026-11-09').textContent()) ?? ''
  ok(/Caiaque/.test(t) && /Aula · Bayswater/.test(t), 'Tudo: visão consolidada de volta')

  // Edit an event through "Editar", reload, still there.
  const title = `Reunião FF ${label}`
  await page.getByRole('button', { name: 'Novo compromisso' }).first().click()
  await page.waitForTimeout(600)
  await page.getByLabel('Título').fill(title)
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: new RegExp(`^${title},`) }).first().click()
  await page.waitForTimeout(500)
  ok((await detail(page).locator('input').count()) === 0, 'novo evento: detalhe sem formulário')
  await detail(page).getByRole('button', { name: 'Editar' }).click()
  await page.waitForTimeout(600)
  await page.getByLabel('Título').fill(`${title} (editada)`)
  await page.getByRole('button', { name: 'Salvar' }).click()
  await page.waitForTimeout(1200)
  await page.reload()
  await page.waitForTimeout(1800)
  t = (await page.getByLabel('Dia 2026-11-09').textContent()) ?? ''
  ok(t.includes(`${title} (editada)`), 'edição persistiu após recarregar')
  const stored = await page.evaluate(async (want) => {
    const idb = await new Promise((res) => {
      const r = indexedDB.open('marina-os')
      r.onsuccess = () => res(r.result)
    })
    const db = await new Promise((res) => {
      const r = idb.transaction('kv').objectStore('kv').get('db')
      r.onsuccess = () => res(r.result)
    })
    return db.events.filter((e) => e.title === want).map((e) => e.date)
  }, `${title} (editada)`)
  ok(stored.length === 1 && stored[0] === '2026-11-09', `IndexedDB: um evento editado em 09/11 (${JSON.stringify(stored)})`)

  // Dark.
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${shots}calendario-${label}-dia-escuro.png` })
  await page.locator('[data-entry="tripItem:seed:travel:za-caiaque"]').first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${shots}calendario-${label}-detalhe-escuro.png` })
  await page.getByRole('button', { name: 'Fechar detalhe' }).click()
  await tab(page, 'Mês')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${shots}calendario-${label}-mes-escuro.png` })
  await noHorizontalScroll(page, 'Mês escuro')
  await ctx.close()
}

const browser = { ...devices['iPad Pro 11'] }
await run('iphone', devices['iPhone 13'], { tz: 'America/Sao_Paulo' })
await run('ipad', browser, { tz: 'Africa/Johannesburg' })
console.log(failures ? `\n${failures} falha(s)` : '\ntudo certo')
process.exit(failures ? 1 : 0)
