import { describe, expect, it } from 'vitest'
import { store } from '../store'
import { tools } from '../../tools'
import type { State } from '../types'

/**
 * Randomised sequences of the operations an agent and a student can perform,
 * checking after every step that the workspace still satisfies the things the
 * rest of the app assumes. This is the cheapest way to find the states that
 * hand written tests never think to build.
 */

const call = (name: string, args: Record<string, unknown> = {}) => {
  const tool = tools.find((t) => t.name === name)
  return tool ? tool.execute(args) : undefined
}

function check(state: State, deep = false) {
  const ids = new Set<string>()

  for (const card of state.cards) {
    expect(ids.has(card.id), `duplicate card id ${card.id}`).toBe(false)
    ids.add(card.id)

    expect(card.ease).toBeGreaterThanOrEqual(1.3)
    expect(card.ease).toBeLessThanOrEqual(3)
    expect(card.interval).toBeGreaterThanOrEqual(0)
    expect(card.reps).toBeGreaterThanOrEqual(0)
    expect(card.lapses).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(card.dueAt)).toBe(true)
    expect(card.history.length).toBeLessThanOrEqual(40)
    expect(card.front.length).toBeGreaterThan(0)
    expect(card.back.length).toBeGreaterThan(0)
    expect(card.topic.length).toBeGreaterThan(0)
    // A card can only belong to a deck that exists.
    expect(state.decks.some((d) => d.id === card.deckId)).toBe(true)
    // A note without a timestamp cannot be measured, and a timestamp without
    // a note has nothing to measure.
    expect(Boolean(card.note)).toBe(Boolean(card.noteAddedAt))
  }

  if (state.session) {
    expect(state.session.index).toBeGreaterThanOrEqual(0)
    expect(state.session.index).toBeLessThanOrEqual(state.session.queue.length)
    expect(state.session.correct).toBeLessThanOrEqual(state.session.graded)
    expect(state.decks.some((d) => d.id === state.session!.deckId)).toBe(true)
    // A queue may repeat a card, but it may never point at one that is gone.
    for (const id of state.session.queue) {
      expect(ids.has(id), `session queue references missing card ${id}`).toBe(true)
    }
  }

  if (state.focus?.cardId) {
    expect(ids.has(state.focus.cardId), 'highlight points at a missing card').toBe(true)
  }

  const planIds = new Set(state.plan.map((b) => b.id))
  expect(planIds.size).toBe(state.plan.length)

  // Whatever is in memory has to survive a trip through storage unchanged,
  // because that is how every returning visitor loads it. Checked periodically
  // rather than every step, since it is the expensive assertion here.
  if (deep) expect(JSON.parse(JSON.stringify(state))).toEqual(state)

  for (const block of state.plan) {
    expect(state.decks.some((d) => d.id === block.deckId)).toBe(true)
    expect(block.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(block.topics.length).toBeGreaterThan(0)
    expect(block.minutes).toBeGreaterThan(0)
  }

  expect(state.activity.length).toBeLessThanOrEqual(60)
  expect(state.requests.filter((r) => r.status === 'pending').length).toBeLessThanOrEqual(1)
}

/** A deterministic generator, so a failure can be replayed from its seed. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('workspace invariants', () => {
  it('holds across randomised agent and student activity', { timeout: 60_000 }, async () => {
    for (let seed = 1; seed <= 30; seed++) {
      const random = rng(seed)
      store.reset('human')

      for (let step = 0; step < 80; step++) {
        const state = store.getSnapshot()
        const cards = state.cards
        const pick = <T,>(list: readonly T[]): T | undefined => list[Math.floor(random() * list.length)]
        const grades = ['again', 'hard', 'good', 'easy'] as const

        const actions = [
          () => call('list_decks'),
          () => call('get_weak_topics', { deck: 'Operating Systems' }),
          () => call('start_session', { deck: 'Operating Systems', mode: pick(['due', 'weak', 'all']), limit: 1 + Math.floor(random() * 8) }),
          () => call('reveal_answer'),
          () => call('grade_current_card', { grade: pick(grades) }),
          () => call('end_session'),
          () => call('annotate_card', { cardId: pick(cards)?.id, note: 'note' }),
          () => call('add_cards', { deck: 'Operating Systems', cards: [{ front: `q${step}`, back: `a${step}`, topic: pick(['A', 'B']) }] }),
          () => call('update_card', { cardId: pick(cards)?.id, topic: 'Moved' }),
          () => call('set_exam_date', { deck: 'Operating Systems', date: random() < 0.3 ? 'none' : '2026-09-20' }),
          () => call('plan_revision', { deck: 'Operating Systems', minutesPerDay: 30 }),
          () => call('queue_cards', { cardIds: cards.slice(0, 3).map((c) => c.id) }),
          () => call('highlight', { topic: 'Deadlock' }),
          () => call('search_cards', { query: 'a' }),
          () => call('get_note_impact', {}),
          async () => {
            const target = pick(cards)
            if (!target) return
            const asked = await call('delete_card', { cardId: target.id })
            const id = (asked?.structuredContent as { requestId?: string } | undefined)?.requestId
            if (id) store.resolveRequest(id, random() < 0.5)
          },
          () => store.createDeck(`Deck ${step}`, '', 'human'),
          () => {
            const deck = pick(store.getSnapshot().decks)
            if (deck && store.getSnapshot().decks.length > 1) store.deleteDeck(deck.id, 'human')
          },
        ]

        await pick(actions)?.()
        check(store.getSnapshot(), step % 10 === 0)
      }
    }
  })
})
