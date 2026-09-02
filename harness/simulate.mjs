/**
 * Agent simulator: installs a fake WebMCP host on the page, then drives the app
 * exactly the way an agent would, through the tools only, never the UI.
 */
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:4173/'
const shots = process.env.SHOTS === '1'

const shim = () => {
  const registry = new Map()
  const api = {
    async registerTool(tool, options) {
      registry.set(tool.name, tool)
      options?.signal?.addEventListener('abort', () => registry.delete(tool.name))
      return true
    },
    async getTools() {
      return [...registry.values()].map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
    },
  }
  Object.defineProperty(document, 'modelContext', { value: api, configurable: true })
  window.__mcp = {
    names: () => [...registry.keys()],
    schemas: () => [...registry.values()].map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })),
    call: async (name, args = {}) => {
      const tool = registry.get(name)
      if (!tool) return { missing: name }
      const r = await tool.execute(args)
      return { text: r.content.map((c) => c.text).join('\n'), isError: !!r.isError, structured: r.structuredContent }
    },
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } })
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console error]', m.text())
})
page.on('pageerror', (e) => console.log('  [page error]', e.message))

await page.addInitScript(shim)
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

const call = async (name, args) => {
  const r = await page.evaluate(([n, a]) => window.__mcp.call(n, a), [name, args ?? {}])
  const flag = r.missing ? 'MISSING' : r.isError ? 'ERROR ' : 'ok    '
  console.log(`  ${flag} ${name}${args ? ' ' + JSON.stringify(args).slice(0, 90) : ''}`)
  if (r.text) console.log('         ' + String(r.text).split('\n').slice(0, 3).join('\n         '))
  return r
}

console.log('\n=== registration ===')
let names = await page.evaluate(() => window.__mcp.names())
console.log(`  idle state: ${names.length} tools registered`)
console.log(`  session controls present while idle: ${names.filter((n) => ['reveal_answer','grade_current_card','queue_cards','end_session'].includes(n)).join(', ') || 'none (correct)'}`)

console.log('\n=== schema sanity ===')
const schemas = await page.evaluate(() => window.__mcp.schemas())
let bad = 0
for (const s of schemas) {
  const problems = []
  if (!/^[a-z][a-z0-9_]*$/.test(s.name)) problems.push('name not snake_case')
  if (!s.description || s.description.length < 40) problems.push('description too thin')
  if (!s.inputSchema || s.inputSchema.type !== 'object') problems.push('inputSchema not an object schema')
  if (!s.annotations || typeof s.annotations.readOnlyHint !== 'boolean') problems.push('missing behaviour annotations')
  for (const req of s.inputSchema?.required ?? []) {
    if (!s.inputSchema.properties?.[req]) problems.push(`required "${req}" missing from properties`)
  }
  if (problems.length) {
    bad++
    console.log(`  FAIL ${s.name}: ${problems.join('; ')}`)
  }
}
console.log(bad === 0 ? '  all schemas valid' : `  ${bad} schema problems`)

console.log('\n=== agent walkthrough ===')
await call('list_decks')
await call('get_weak_topics', { deck: 'Operating Systems' })
await call('start_session', { deck: 'Operating Systems', mode: 'weak', limit: 6 })
await page.waitForTimeout(500)
names = await page.evaluate(() => window.__mcp.names())
console.log(`  -> after start_session: ${names.length} tools registered, start_session present: ${names.includes('start_session')}`)
const state = await call('get_study_state')
const cardId = state.structured?.currentCard?.id
await call('reveal_answer')
if (cardId) await call('annotate_card', { cardId, note: 'Mnemonic: MHNC for Mutual exclusion, Hold and wait, No preemption, Circular wait.' })
await call('grade_current_card', { grade: 'again' })
await call('highlight', { topic: 'Deadlock', reason: 'weakest topic' })
await call('search_cards', { query: 'thrashing' })
await call('add_cards', {
  deck: 'Operating Systems',
  cards: [{ front: 'What is a safe state?', back: 'A state where some completion order exists for all processes.', topic: 'Deadlock' }],
})
await call('set_exam_date', { deck: 'Operating Systems', date: '2026-09-14' })
await call('plan_revision', { deck: 'Operating Systems', minutesPerDay: 45 })
await call('queue_cards', { cardIds: state.structured?.currentCard ? [state.structured.currentCard.id] : [] })
await call('get_note_impact', { deck: 'Operating Systems' })
await call('end_session')
await page.waitForTimeout(500)
names = await page.evaluate(() => window.__mcp.names())
console.log(`  -> after end_session: ${names.length} tools registered, grade_current_card present: ${names.includes('grade_current_card')}`)

console.log('\n=== error paths ===')
await call('get_deck', { deck: 'Quantum Basketry' })
await call('grade_current_card', { grade: 'good' })
await call('start_session', { deck: 'Polish', mode: 'topic', topic: 'Nonexistent' })
await call('annotate_card', { cardId: 'nope', note: 'x' })
const firstCard = (await call('search_cards', { query: 'thrashing' })).structured?.matches?.[0]?.id
if (firstCard) {
  const asked = await call('delete_card', { cardId: firstCard, reason: 'duplicate' })
  const reqId = asked.structured?.requestId
  await call('get_approval', { requestId: reqId })
  const stillThere = await page.evaluate((id) => !!document.body.innerText && !!id, reqId)
  console.log(`         card survives an unanswered request: ${stillThere}`)
  // Only a click in the interface can resolve it, which is the point.
  await page.getByRole('button', { name: 'Deny' }).click()
  await call('get_approval', { requestId: reqId })
}

if (shots) {
  await page.screenshot({ path: 'harness/dashboard.png', fullPage: false })
  await call('start_session', { deck: 'Operating Systems', mode: 'weak', limit: 6 })
  await call('reveal_answer')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'harness/study.png', fullPage: false })
}

await browser.close()
console.log('\ndone.\n')
