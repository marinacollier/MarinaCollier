// Ateliê Literário (iPhone 13): opens from Espaços, the 9 records are there with "texto pendente", a new text is
// written, autosaved, survives a reload as a version; restore + compare; screenshots light and dark.
// Prereq: npx vite build && npx vite preview --port 4332 --strictPort
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = process.env.BASE ?? 'http://localhost:4332'
const dir = new URL('./.profiles/profile-atelie', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
let failures = 0
const check = (ok, msg) => {
  log(ok ? 'ok  ' : 'FAIL', msg)
  if (!ok) failures++
}
const open = async (path, colorScheme = 'light') => {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'], colorScheme })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => {
    failures++
    log('PAGEERROR', e.stack)
  })
  await page.goto(base + '/')
  await page.waitForTimeout(2000)
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.count()) {
    await enter.click()
    await page.waitForTimeout(800)
  }
  if (path) {
    await page.goto(base + path)
    await page.waitForTimeout(1200)
  }
  return { ctx, page }
}
const text = async (page) => (await page.locator('main').innerText()).replace(/\n+/g, ' | ')
const noHScroll = async (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

// 1. Espaços → Ateliê
let { ctx, page } = await open('/espacos')
check((await text(page)).includes('Ateliê Literário'), 'Espaços lists the Ateliê')
await page.getByText('Ateliê Literário').first().click()
await page.waitForTimeout(1000)
check(page.url().includes('/atelie'), 'opens /atelie')
await page.screenshot({ path: shots + 'atelie-home-light.png', fullPage: true })
check(await noHScroll(page), 'home: no horizontal scroll')

// 2. Biblioteca: 9 works, text pending
await page.getByRole('tab', { name: 'Biblioteca' }).click()
await page.waitForTimeout(500)
const lib = await text(page)
check(lib.includes('9 obras'), 'library shows 9 works')
check((lib.match(/texto pendente/g) ?? []).length >= 9, 'every seeded work shows "texto pendente"')
await page.screenshot({ path: shots + 'atelie-biblioteca-light.png', fullPage: true })
await page.getByLabel('Buscar no acervo').fill('cadeira')
await page.waitForTimeout(300)
check((await text(page)).includes('1 obra'), 'search narrows to 1')
await page.getByLabel('Buscar no acervo').fill('')

// 3. New free text
await page.getByRole('tab', { name: 'Visão geral' }).click()
await page.getByRole('button', { name: 'Escrever', exact: true }).last().click()
await page.waitForTimeout(300)
await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Teste de vento')
await page.getByRole('button', { name: 'Abrir a página' }).click()
await page.waitForTimeout(800)
check(page.url().includes('/atelie/obra/'), 'new work opens the editor')
const workUrl = page.url().split('?')[0]
await page.getByLabel('Texto', { exact: true }).fill('O vento entrou pela janela\nsem pedir licença.')
await page.waitForTimeout(1800)
check(await page.getByText('Salvo', { exact: true }).isVisible(), 'autosave indicator says "Salvo"')
await page.screenshot({ path: shots + 'atelie-editor-light.png', fullPage: true })
await page.getByRole('button', { name: 'Concentração' }).click()
await page.waitForTimeout(400)
check(await page.getByRole('dialog', { name: 'Modo concentração' }).isVisible(), 'focus mode covers the screen')
check(!(await page.getByRole('navigation', { name: 'Navegação principal' }).isVisible()) || (await page.evaluate(() => {
  const nav = document.querySelector('nav[aria-label="Navegação principal"]')
  const r = nav.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return !nav.contains(top)
})), 'nav hidden under focus mode')
await page.screenshot({ path: shots + 'atelie-focus-light.png' })
await page.getByRole('button', { name: 'Sair' }).click()
await ctx.close()

// 4. Reload: text and version persisted
;({ ctx, page } = await open(workUrl.replace(base, ''), 'dark'))
const body = await page.getByLabel('Texto', { exact: true }).inputValue()
check(body === 'O vento entrou pela janela\nsem pedir licença.', 'text persisted after full restart')
await page.getByRole('tab', { name: /Versões/ }).click()
await page.waitForTimeout(400)
check((await text(page)).includes('Versão 1'), 'version 1 exists after restart')
// a second session → version 2, then compare and restore
await page.getByRole('tab', { name: 'Texto' }).click()
await page.getByLabel('Texto', { exact: true }).fill('O vento entrou pela porta\nsem pedir licença.')
await page.waitForTimeout(1500)
await page.getByRole('tab', { name: /Versões/ }).click()
await page.waitForTimeout(400)
check((await text(page)).includes('Versão 2'), 'leaving the editor keeps a new version')
await page.getByRole('button', { name: 'Comparar duas versões' }).click()
await page.waitForTimeout(300)
const diff = await page.getByLabel('Diferenças').innerText()
check(diff.includes('janela') && diff.includes('porta'), 'compare shows both words')
await page.screenshot({ path: shots + 'atelie-versions-dark.png', fullPage: true })
await page.getByRole('button', { name: /Versão 1/ }).click()
await page.getByRole('button', { name: 'Restaurar como nova versão' }).click()
await page.waitForTimeout(600)
check((await page.getByLabel('Texto', { exact: true }).inputValue()).includes('janela'), 'restore brings version 1 back as the current text')
await page.getByRole('tab', { name: /Versões/ }).click()
await page.waitForTimeout(300)
check((await text(page)).includes('Versão 3'), 'restore created version 3 (nothing overwritten)')

// 5. Seeded work page (dark)
await page.goto(base + '/atelie/obra/' + encodeURIComponent('seed:atelie:a-cadeira'))
await page.waitForTimeout(900)
const cadeira = await text(page)
check(cadeira.includes('Era eu quem continuava guardando o lugar.'), 'excerpt shown as excerpt')
check(cadeira.includes('verificar aprovação'), 'provenance flag shown (not "aprovada")')
await page.screenshot({ path: shots + 'atelie-cadeira-dark.png', fullPage: true })
for (const tab of ['geral', 'biblioteca', 'colecoes', 'evolucao', 'mapa', 'laboratorio']) {
  await page.goto(base + '/atelie' + (tab === 'geral' ? '' : '?v=' + tab))
  await page.waitForTimeout(700)
  check(await noHScroll(page), `${tab}: no horizontal scroll`)
  await page.screenshot({ path: shots + `atelie-${tab}-dark.png`, fullPage: true })
}
await ctx.close()

log(failures ? `\n${failures} falha(s)` : '\nTudo certo.')
process.exit(failures ? 1 : 0)
