// Daily Briefing v2 — the Definition of Done in a real browser (iPhone 13): paste → preview → Importar →
// Home (4 to-dos, No radar, no Waiting on Hoje) → "B.O. feito" → "Vitor respondeu" → "JNB fica pra segunda"
// → reimport → close/reopen → all still right.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4310'
const dir = new URL('./.profiles/profile-briefing2', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const payload = JSON.stringify({
  date: today,
  source: 'Daily Executive Briefing',
  tasks: [
    { title: 'Abrir B.O. de pedágio', category: 'Logística', project: 'Vida/Admin', priority: 'P1', done_criteria: 'Ocorrência registrada e comprovante salvo', estimated_minutes: 30, status: 'todo', due_date: today },
    { title: 'Verificar integração Daily e Marina OS', category: 'Produto/IA', project: 'Marina OS', priority: 'P2', done_criteria: 'Importação testada e falhas registradas', estimated_minutes: 25, status: 'todo', due_date: null },
    { title: 'Consolidar pendências JNB', category: 'Viagem', project: 'África do Sul', priority: 'P3', done_criteria: 'Pendências de hospedagem e safari identificadas', estimated_minutes: 20, status: 'todo', due_date: null },
    { title: 'Separar case executivo', category: 'Portfólio', project: 'Carreira', priority: 'Optional', done_criteria: 'Problema, decisão e impacto documentados', estimated_minutes: 20, status: 'todo', due_date: null },
  ],
  backlog_watchlist: [
    { title: 'Multas do carro', project: 'Vida/Admin', status: 'scheduled', notes: 'Semana de 12 a 16/10' },
    { title: 'Hospedagem e safari JNB', project: 'África do Sul', status: 'scheduled', notes: 'Resolver na próxima semana' },
    { title: 'Épicos layout, DUP0005, ativação, enquadramento e instruções', project: 'Santander', status: 'scheduled', notes: 'Priorizar a partir de 13/10; cobrar agendas' },
    { title: 'Contas Apple, Google, PJ e LinkedIn', project: 'Fashion Finder', status: 'scheduled', notes: 'Pendências operacionais' },
    { title: 'Próximos passos com Duda', project: 'Yoga App', status: 'scheduled', notes: 'Alinhamento pendente' },
    { title: 'Retorno do Vitor', project: 'Day One', status: 'waiting', notes: 'Aguardar resposta' },
    { title: 'Retorno do Thales', project: 'Tranquilo SP', status: 'waiting', notes: 'Aguardar resposta' },
    { title: 'Pagamentos e despesas recorrentes', project: 'Vida/Admin', status: 'recurring', notes: 'Manter categorias cadastradas; valores e vencimentos ajustáveis mensalmente' },
  ],
}, null, 2)
const open = async () => {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'] })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => log('PAGEERROR', e.message))
  await page.goto(base + '/')
  await page.waitForTimeout(2500)
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.count()) { await enter.click(); await page.waitForTimeout(800) }
  return { ctx, page }
}
const say = async (page, q) => {
  const box = page.getByLabel(/^Fal[ae] com a Lumos$/).last()
  await box.fill(q)
  await box.press('Enter')
  await page.waitForTimeout(1200)
}
const closeConv = async (page) => { await page.getByRole('button', { name: /fechar conversa/ }).click().catch(() => {}); await page.waitForTimeout(600) }
const hoje = (page) => page.locator('section[aria-label="Hoje"]')

let { ctx, page } = await open()
// 1–4: paste → preview → Importar
await say(page, payload)
const card = page.getByRole('button', { name: 'Importar' })
await card.scrollIntoViewIfNeeded()
await page.screenshot({ path: shots + 'briefing2-preview.png' })
log('preview:', (await page.getByText(/tarefas do dia ·/).first().textContent())?.trim())
await card.click()
await page.waitForTimeout(1500)
log('result:', (await page.getByText(/Daily Briefing importado/).first().textContent().catch(() => 'NOT SHOWN'))?.trim())
await closeConv(page)
// 5–7: Home
const hojeText = await hoje(page).innerText()
for (const t of ['Abrir B.O de pedágio', 'Verificar integração Daily e Marina OS', 'Consolidar pendências JNB', 'Separar case executivo']) log(`  on Hoje: ${t}:`, hojeText.includes(t))
log('  future NOT on Hoje:', !/Épicos layout|Contas Apple|Multas do carro/.test(hojeText), '· Waiting NOT on Hoje:', !/Retorno do (Vitor|Thales)/.test(hojeText))
await page.locator('section[aria-label="Próximos"]').scrollIntoViewIfNeeded()
const radar = page.getByRole('button', { name: /^No radar · / })
log('radar fold:', await radar.textContent())
await radar.click()
await page.waitForTimeout(400)
await page.screenshot({ path: shots + 'briefing2-radar.png' })
// 8–10: Lumos
await say(page, 'B.O. feito.')
log('B.O.:', (await page.getByText(/B\.O de pedágio” feito/).first().textContent().catch(() => 'NO'))?.trim())
await say(page, 'Vitor respondeu.')
log('Vitor:', (await page.getByText(/Vitor respondeu sobre/).first().textContent().catch(() => 'NO'))?.trim())
await say(page, 'JNB fica pra segunda.')
log('JNB:', (await page.getByText(/JNB” vai pra/).first().textContent().catch(() => 'NO'))?.trim())
await closeConv(page)
// 11: reimport
await say(page, payload)
log('reimport:', (await page.getByText(/já está no app/).first().textContent().catch(() => 'NO'))?.trim())
await closeConv(page)
await ctx.close()

// 13–14: close & reopen
;({ ctx, page } = await open())
const h2 = await hoje(page).innerText()
log('after reopen · JNB gone from Hoje:', !h2.includes('Consolidar pendências JNB'))
const fold = page.getByRole('button', { name: /^Feitos hoje · / })
if (await fold.count()) await fold.first().click()
log('after reopen · B.O. done:', (await page.locator('section[aria-label="Hoje"] button[aria-label="Desmarcar Abrir B.O de pedágio"]').count()) === 1)
await say(page, 'o que veio do briefing hoje?')
await page.waitForTimeout(500)
await page.screenshot({ path: shots + 'briefing2-what.png', fullPage: false })
log('what came:', (await page.getByText(/^Do briefing de/).first().textContent().catch(() => 'NO'))?.trim())
const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
log('horizontal overflow:', m.sw > m.cw + 1)
await ctx.close()
