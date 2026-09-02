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
