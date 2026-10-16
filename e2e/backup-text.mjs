// Backup inside an iframe (like the Claude app/preview): "Exportar" shows the backup as text; the text is a
// valid backup; pasting it back shows the restore preview. iPhone 13. Prereq: vite preview on E2E_BASE.
import { createRequire } from 'module'
import fs from 'fs'
import http from 'http'
const require = createRequire(new URL('../package.json', import.meta.url))
const { chromium, devices } = require('playwright')
const base = process.env.E2E_BASE ?? 'http://localhost:4319'
const ok = (c, m) => { if (!c) { console.error('FALHOU:', m); process.exitCode = 1 } }
const host = http.createServer((_q, r) => { r.setHeader('content-type', 'text/html'); r.end(`<iframe src="${base}/" style="width:100%;height:100vh;border:0"></iframe>`) }).listen(4399)
const dir = new URL('./.profiles/profile-backup-text', import.meta.url).pathname
fs.rmSync(dir, { recursive: true, force: true })
const ctx = await chromium.launchPersistentContext(dir, { ...devices['iPhone 13'] })
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto('http://localhost:4399/'); await page.waitForTimeout(3000)
const f = page.frames().find((x) => x.url().startsWith(base))
const enter = f.getByRole('button', { name: /Entrar no meu dia/i })
if (await enter.count()) { await enter.click(); await page.waitForTimeout(800) }
await f.evaluate(() => { history.pushState({}, '', '/ajustes/dados'); dispatchEvent(new PopStateEvent('popstate')) })
await page.waitForTimeout(1500)
await f.getByRole('button', { name: 'Exportar' }).click(); await page.waitForTimeout(800)
const text = await f.getByLabel('Backup em texto', { exact: true }).inputValue()
let parsed; try { parsed = JSON.parse(text) } catch {}
ok(parsed?.app === 'marina-os' && typeof parsed.checksum === 'string', 'export shows a real backup as text')
await f.getByText('Restaurar colando o texto do backup').click()
await f.getByLabel('Colar backup em texto').fill(text)
await f.getByRole('button', { name: 'Ver o que tem no backup' }).click(); await page.waitForTimeout(500)
ok((await f.getByText('Backup encontrado').count()) === 1, 'pasted text shows restore preview')
await page.screenshot({ path: new URL('./.shots/backup-text.png', import.meta.url).pathname })
console.log(process.exitCode ? 'BACKUP TEXTO: FALHOU' : `BACKUP TEXTO: OK (${(text.length / 1024).toFixed(0)} KB)`)
await ctx.close(); host.close()
