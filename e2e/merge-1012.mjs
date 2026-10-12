// 12/10 merge check (iPhone 13): Home shows briefing tasks + B.O. overdue; check LinkedIn persists across reload;
// UGC Hoje + dashboard; Bíblia Êxodo 5/40 → check 6 persists.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4310'
const dir = new URL('./.profiles/profile-1012', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
const log = (...a) => console.log(...a)
const open = async (path) => {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'] })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => log('PAGEERROR', e.message))
  await page.goto(base + '/'); await page.waitForTimeout(2500)
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.count()) { await enter.click(); await page.waitForTimeout(800) }
  if (path) { await page.goto(base + path); await page.waitForTimeout(1500) }
  return { ctx, page }
}
let { ctx, page } = await open()
const hoje = await page.locator('section[aria-label="Hoje"]').innerText()
for (const t of ['Revisar LinkedIn executivo', 'Priorizar Fashion Finder', 'Preparar pauta Santander', 'B.O', 'Organizar hospedagem JNB', 'inglês']) log('home has', t, hoje.includes(t))
log('overdue:', /atrasad[oa] desde 10\/10/.test(hoje))
await page.locator('button[aria-label="Concluir: Revisar LinkedIn executivo"]').first().click()
await page.waitForTimeout(800)
await ctx.close()
;({ ctx, page } = await open())
log('LinkedIn persisted done:', await page.locator('button[aria-label^="Desmarcar"][aria-label*="LinkedIn"], button[aria-label*="Reabrir"][aria-label*="LinkedIn"]').count(), (await page.locator('main').innerText()).includes('Revisar LinkedIn'))
await page.goto(base + '/trabalho/creator/ugc'); await page.waitForTimeout(1500)
log('ugc:', (await page.locator('main').innerText()).split('\n').slice(0, 30).join(' | ').slice(0, 900))
await page.screenshot({ path: 'e2e/.shots/ugc-hoje.png', fullPage: true })
await page.goto(base + '/biblia'); await page.waitForTimeout(1500)
log('biblia:', (await page.locator('main').innerText()).split('\n').slice(0, 14).join(' | '))
await page.screenshot({ path: 'e2e/.shots/biblia.png', fullPage: true })
await ctx.close()
