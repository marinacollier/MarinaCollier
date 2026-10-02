// Usage: node scripts/screenshot.mjs <baseUrl> <outDir> [paths...]
// Captures iPhone-sized screenshots (390x844 @3x) of the given routes, skipping the first-run welcome.
import { chromium, devices } from 'playwright'

const [base = 'http://localhost:4173', out = '.', ...paths] = process.argv.slice(2)
const routes = paths.length ? paths : ['/']
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: process.env.DARK ? 'dark' : 'light' })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.error('PAGEERROR', e.message))
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()))
await page.goto(base + '/')
await page.waitForTimeout(800)
if (!process.env.KEEP_WELCOME) {
  const btn = page.getByRole('button', { name: /Entrar no meu dia/i })
  if (await btn.count()) {
    await btn.click()
    await page.waitForTimeout(700)
  }
}
for (const r of routes) {
  await page.goto(base + r)
  await page.waitForTimeout(900)
  const name = r === '/' ? 'home' : r.replace(/\//g, '_').replace(/^_/, '')
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: !!process.env.FULL })
  console.log('📸', r)
}
await browser.close()
