/**
 * Automated accessibility scan. Runs axe-core against the three states the app
 * can be in: dashboard, an active study session, and a pending permission
 * request. Catches roughly the third of WCAG issues a machine can see; the
 * rest still needs a keyboard and a screen reader.
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { startTargetServer } from './local-server.mjs'

const target = await startTargetServer()
const URL = target.url
const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8')

const shim = () => {
  const registry = new Map()
  Object.defineProperty(document, 'modelContext', {
    value: {
      async registerTool(t, o) {
        registry.set(t.name, t)
        o?.signal?.addEventListener('abort', () => registry.delete(t.name))
        return true
      },
      async getTools() {
        return [...registry.values()].map((t) => ({ name: t.name }))
      },
    },
    configurable: true,
  })
  window.__mcp = { call: async (n, a = {}) => { const t = registry.get(n); return t ? t.execute(a) : null } }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } })
await page.addInitScript(shim)
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

const states = [
  ['dashboard', async () => {
    const keepButton = page.getByRole('button', { name: 'Keep it' })
    if (await keepButton.count()) await keepButton.click()
    await page.evaluate(() => window.__mcp.call('end_session'))
  }],
  ['study session', async () => {
    await page.evaluate(() => window.__mcp.call('start_session', { deck: 'Operating Systems', mode: 'weak', limit: 5 }))
    await page.evaluate(() => window.__mcp.call('reveal_answer'))
  }],
  ['permission request', async () => {
    await page.evaluate(() => window.__mcp.call('end_session'))
    const id = await page.evaluate(async () => (await window.__mcp.call('search_cards', { query: 'thrashing' })).structuredContent.matches[0].id)
    await page.evaluate((cardId) => window.__mcp.call('delete_card', { cardId, reason: 'duplicate' }), id)
  }],
]

const themes = process.env.THEME ? [process.env.THEME] : ['dark', 'light']
let total = 0
for (const theme of themes) {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForTimeout(200)
  for (const [name, setup] of states) {
    await setup()
    await page.waitForTimeout(400)
    await page.addScriptTag({ content: axe })
    const results = await page.evaluate(async () =>
      // eslint-disable-next-line no-undef
      await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }),
    )
    const violations = results.violations
    total += violations.length
    console.log(`  ${theme} / ${name}: ${violations.length} violation${violations.length === 1 ? '' : 's'}`)
    for (const v of violations) {
      console.log(`    [${v.impact}] ${v.id}: ${v.help}`)
      for (const node of v.nodes.slice(0, 3)) console.log(`        ${node.target.join(' ')}`)
    }
  }
}

console.log(`\ntotal violations: ${total}`)
await browser.close()
await target.close()
process.exitCode = total === 0 ? 0 : 1
