// LinkedIn posts (Modo A) in a real browser (iPhone 13): draft → blocked term → review → approve → edit drops
// approval → re-approve → copy → register URL → counts on the career week → survives a reopen.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = 'http://localhost:4310'
const dir = new URL('./.profiles/profile-posts', import.meta.url).pathname
const shots = new URL('./.shots/', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(shots, { recursive: true })
const log = (...a) => console.log(...a)
const fail = (m) => {
  console.error('FAIL:', m)
  process.exitCode = 1
}
const open = async () => {
  const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => fail('PAGEERROR ' + e.message))
  await page.goto(base + '/')
  const enter = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await enter.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
    await enter.click()
    await enter.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
  }
  await page.goto(base + '/carreira/posts')
  await page.waitForTimeout(1200)
  return { ctx, page }
}
const sheet = (page) => page.locator('[role="dialog"]').last()

let { ctx, page } = await open()
await page.screenshot({ path: shots + 'posts-empty.png' })

// Blocked term saved on the device.
await page.getByPlaceholder('um por linha').fill('Acme')
await page.getByRole('button', { name: 'Salvar termos' }).click()
await page.waitForTimeout(400)

// New draft with a blocked term → cannot go to review.
await page.getByRole('button', { name: /Novo post/ }).click()
await page.waitForTimeout(600)
await page.getByPlaceholder('Tema (só pra você)').fill('Tese: IA desde 2017')
await page.getByPlaceholder(/Escreva aqui/).fill('In 2017 I was building conversational AI at Acme.')
await sheet(page).getByRole('checkbox', { name: /confidencial/ }).click()
await sheet(page).getByRole('checkbox', { name: /reais/ }).click()
if (!(await sheet(page).getByText(/termo bloqueado/).count())) fail('blocked term not flagged')
if (!(await sheet(page).getByRole('button', { name: 'Enviar para revisão' }).isDisabled())) fail('review should be disabled with a blocked term')
await page.getByPlaceholder(/Escreva aqui/).fill('In 2017 I was building conversational AI. That thread never stopped.')
await page.screenshot({ path: shots + 'posts-draft.png' })
await sheet(page).getByRole('button', { name: 'Enviar para revisão' }).click()
await page.waitForTimeout(700)

// Approve.
await page.getByRole('button', { name: /Tese: IA desde 2017/ }).click()
await page.waitForTimeout(600)
await sheet(page).getByRole('button', { name: 'Aprovo este texto' }).click()
await page.waitForTimeout(700)
if (!(await sheet(page).getByRole('button', { name: 'Copiar texto e abrir LinkedIn' }).count())) fail('approved post should offer copy')

// Editing the text drops the approval.
await sheet(page).getByRole('button', { name: /Editar texto/ }).click()
await page.waitForTimeout(700)
if (!(await page.getByText('Rascunho').count())) fail('post should be back in rascunho')
await page.getByRole('button', { name: /Tese: IA desde 2017/ }).click()
await page.waitForTimeout(600)
await page.getByPlaceholder(/Escreva aqui/).fill('In 2017 I was building conversational AI. That thread never stopped — it moved into regulated finance.')
await sheet(page).getByRole('button', { name: 'Enviar para revisão' }).click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: /Tese: IA desde 2017/ }).click()
await page.waitForTimeout(600)
await sheet(page).getByRole('button', { name: 'Aprovo este texto' }).click()
await page.waitForTimeout(700)
await page.screenshot({ path: shots + 'posts-approved.png' })

// Copy (LinkedIn opens in a new tab — close it; the app never sends anything there).
const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => undefined), sheet(page).getByRole('button', { name: 'Copiar texto e abrir LinkedIn' }).click()])
log('opened:', popup ? popup.url() : '(no tab)')
await popup?.close()
const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
if (!clip.includes('regulated finance')) fail('clipboard should hold the approved text, got: ' + clip)

// Bad URL, then the real one.
await sheet(page).getByPlaceholder(/linkedin.com\/posts/).fill('https://www.linkedin.com/in/marinacollieramelo/')
await sheet(page).getByRole('button', { name: 'Registrar publicação' }).click()
await page.waitForTimeout(500)
if ((await page.getByText(/link do perfil/).count()) === 0) fail('profile URL should be refused')
await sheet(page).getByPlaceholder(/linkedin.com\/posts/).fill('https://www.linkedin.com/posts/marinacollieramelo_ai-activity-7380000000000000000-AbCd')
await sheet(page).getByRole('button', { name: 'Registrar publicação' }).click()
await page.waitForTimeout(900)
const week = await page.getByText(/posts publicados/).first().textContent()
log('week:', week)
if (!/^1\//.test(week ?? '')) fail('week should count 1 post')
await page.screenshot({ path: shots + 'posts-published.png' })
await ctx.close()

// Reopen: everything persisted.
;({ ctx, page } = await open())
const after = await page.getByText(/posts publicados/).first().textContent()
if (!/^1\//.test(after ?? '')) fail('after reopen, week should still count 1 post: ' + after)
if (!(await page.getByText('Publicado').count())) fail('published section missing after reopen')
await page.goto(base + '/carreira')
await page.waitForTimeout(1000)
if (!(await page.getByText('Posts do LinkedIn').count())) fail('Carreira should link to posts')
await page.screenshot({ path: shots + 'posts-career-link.png' })
await ctx.close()
log(process.exitCode ? 'linkedin-posts: FAILED' : 'linkedin-posts: OK')
