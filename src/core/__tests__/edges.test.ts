import { beforeEach, describe, expect, it } from 'vitest'
import { store } from '../store'
import { tools } from '../../tools'

const call = (name: string, args: Record<string, unknown> = {}) => {
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`no tool named ${name}`)
  return tool.execute(args)
}
const text = (r: Awaited<ReturnType<typeof call>>) => r.content.map((c) => c.text).join('\n')

beforeEach(() => store.reset('human'))

/** Each of these is a regression test for a defect that was actually present. */
describe('edges that used to break', () => {
  it('drops a deleted deck’s cards out of a running session instead of leaving ghosts', async () => {
    const [os, algo] = store.getSnapshot().decks
    await call('start_session', { deck: os!.name, mode: 'all', limit: 3 })
    await call('queue_cards', { cardIds: store.cardsOf(algo!.id).map((c) => c.id) })
    expect(store.currentCard()).not.toBeNull()

    store.deleteDeck(algo!.id, 'human')

    const s = store.getSnapshot()
    const dangling = (s.session?.queue ?? []).filter((id) => !s.cards.some((c) => c.id === id))
    expect(dangling).toHaveLength(0)
    // Every card in the queue was from the deleted deck, so the session ends
    // rather than sitting open on nothing.
    expect(s.session).toBeNull()
  })

  it('refuses an exam date in the past rather than reporting negative days', async () => {
    const os = store.getSnapshot().decks[0]!
    const before = store.deck(os.id)?.examAt
    const r = await call('set_exam_date', { deck: os.name, date: '2020-01-01' })
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('in the past')
    // The refusal must leave the existing date alone, not half apply the change.
    expect(store.deck(os.id)?.examAt).toBe(before)
  })

  it('refuses to plan around an exam that has already happened', async () => {
    const os = store.getSnapshot().decks[0]!
    store.setExam(os.id, Date.now() - 5 * 86_400_000, 'human')
    const r = await call('plan_revision', { deck: os.name, minutesPerDay: 30 })
    expect(r.isError).toBe(true)
    expect(store.getSnapshot().plan).toHaveLength(0)
  })

  it('clears a highlight that points at a card the student deleted', () => {
    const card = store.getSnapshot().cards[0]!
    store.setFocus({ cardId: card.id, reason: 'look here' }, 'agent')
    store.deleteCard(card.id, 'human')
    expect(store.getSnapshot().focus).toBeNull()
  })

  it('never advances the session index past the end of the queue', async () => {
    await call('start_session', { deck: 'Operating', mode: 'all', limit: 2 })
    for (let i = 0; i < 6; i++) await call('grade_current_card', { grade: 'good' })
    const s = store.getSnapshot().session!
    expect(s.index).toBeLessThanOrEqual(s.queue.length)
  })

  it('rejects a card with an empty front or back', async () => {
    const before = store.getSnapshot().cards.length
    const r = await call('add_cards', { deck: 'Operating', cards: [{ front: '   ', back: 'x' }] })
    expect(r.isError).toBe(true)
    expect(store.getSnapshot().cards.length).toBe(before)
  })

  it('will not queue a second permission request over an unanswered one', async () => {
    const [a, b] = store.getSnapshot().cards
    await call('delete_card', { cardId: a!.id })
    const second = await call('delete_card', { cardId: b!.id })
    expect(second.isError).toBe(true)
    expect(store.getSnapshot().requests.filter((r) => r.status === 'pending')).toHaveLength(1)
  })
})

describe('bounds under load', () => {
  it('pages search results and refuses an offset past the end', async () => {
    await call('add_cards', {
      deck: 'Operating',
      cards: Array.from({ length: 30 }, (_, i) => ({ front: `paging probe ${i}`, back: 'x' })),
    })
    const first = await call('search_cards', { query: 'paging probe', limit: 10 })
    const p1 = first.structuredContent as { total: number; count: number; hasMore: boolean; nextOffset: number | null }
    expect(p1.total).toBe(30)
    expect(p1.count).toBe(10)
    expect(p1.hasMore).toBe(true)
    expect(p1.nextOffset).toBe(10)

    const last = await call('search_cards', { query: 'paging probe', limit: 10, offset: 20 })
    expect((last.structuredContent as { hasMore: boolean }).hasMore).toBe(false)

    const past = await call('search_cards', { query: 'paging probe', offset: 999 })
    expect(past.isError).toBe(true)
    expect(text(past)).toContain('past the end')
  })

  it('tells the agent how many cards it did not add', async () => {
    const r = await call('add_cards', {
      deck: 'Operating',
      cards: Array.from({ length: 700 }, (_, i) => ({ front: `q${i}`, back: `a${i}` })),
    })
    expect(text(r)).toContain('500')
    expect(text(r)).toContain('another call')
    expect((r.structuredContent as { overLimit: number }).overLimit).toBe(200)
  })

  it('trims text that would otherwise fill browser storage', async () => {
    await call('add_cards', { deck: 'Operating', cards: [{ front: 'x'.repeat(50_000), back: 'y' }] })
    const longest = Math.max(...store.getSnapshot().cards.map((c) => c.front.length))
    expect(longest).toBeLessThanOrEqual(2000)
  })

  it('never hands an agent an unbounded deck dump', async () => {
    await call('add_cards', {
      deck: 'Operating',
      cards: Array.from({ length: 400 }, (_, i) => ({ front: `question ${i}`, back: `answer ${i}` })),
    })
    const r = await call('get_deck', { deck: 'Operating' })
    const payload = r.structuredContent as { total: number; count: number; hasMore: boolean; nextOffset: number | null }
    expect(payload.count).toBeLessThanOrEqual(60)
    expect(payload.hasMore).toBe(true)
    expect(payload.nextOffset).toBe(payload.count)
    expect(text(r)).toContain('not shown')

    // The next page must continue where the first one stopped.
    const next = await call('get_deck', { deck: 'Operating', offset: payload.nextOffset ?? 0 })
    const second = next.structuredContent as { offset: number; cards: Array<{ id: string }> }
    expect(second.offset).toBe(payload.count)
    const firstIds = new Set((r.structuredContent as { cards: Array<{ id: string }> }).cards.map((c) => c.id))
    expect(second.cards.some((c) => firstIds.has(c.id))).toBe(false)
  })
})

describe('relative time', () => {
  it('never shows a negative age for something that just happened', async () => {
    // The clock the feed renders against is sampled on an interval, so an
    // entry can be newer than the last sample.
    const { ago } = await import('../relativeTime')
    const now = Date.now()
    expect(ago(now + 2000, now)).toBe('just now')
    expect(ago(now, now)).toBe('just now')
    expect(ago(now - 30_000, now)).toBe('30s ago')
    expect(ago(now - 300_000, now)).toBe('5m ago')
  })
})
