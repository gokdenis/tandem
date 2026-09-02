import { beforeEach, describe, expect, it } from 'vitest'
import { activeTools, IDLE_ONLY, SESSION_ONLY, tools } from '../index'
import { store } from '../../core/store'

const call = (name: string, args: Record<string, unknown> = {}) => {
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`no tool named ${name}`)
  return tool.execute(args)
}
const text = (r: Awaited<ReturnType<typeof call>>) => r.content.map((c) => c.text).join('\n')

/** Fails the test rather than silently working on undefined. */
function firstCard() {
  const card = store.getSnapshot().cards[0]
  if (!card) throw new Error('the seeded workspace has no cards')
  return card
}

beforeEach(() => {
  store.reset('human')
})

describe('the tool surface', () => {
  it('gives every tool a snake_case name, a substantive description and an object schema', () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(tool.description.length).toBeGreaterThan(60)
      expect(tool.inputSchema.type).toBe('object')
      for (const required of tool.inputSchema.required ?? []) {
        expect(tool.inputSchema.properties).toHaveProperty(required)
      }
    }
  })

  it('declares behaviour hints on every tool, so none ships without a stance', () => {
    for (const tool of tools) {
      expect(typeof tool.annotations?.readOnlyHint).toBe('boolean')
      expect(typeof tool.annotations?.destructiveHint).toBe('boolean')
    }
  })

  it('withdraws session controls when no card is on screen and start_session when one is', () => {
    const idle = activeTools(false).map((t) => t.name)
    const studying = activeTools(true).map((t) => t.name)
    for (const name of SESSION_ONLY) {
      expect(idle).not.toContain(name)
      expect(studying).toContain(name)
    }
    for (const name of IDLE_ONLY) {
      expect(idle).toContain(name)
      expect(studying).not.toContain(name)
    }
  })
})

describe('recoverable failures', () => {
  it('answers an unknown deck with the decks that do exist', async () => {
    const r = await call('get_deck', { deck: 'Quantum Basketry' })
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('Operating Systems')
  })

  it('answers an unknown topic with the topics that do exist', async () => {
    const r = await call('start_session', { deck: 'Operating Systems', mode: 'topic', topic: 'Nope' })
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('Deadlock')
  })
})

describe('deleting a card', () => {
  it('only asks, and leaves the card in place until a human answers', async () => {
    const before = store.getSnapshot().cards.length
    const target = firstCard()

    const asked = await call('delete_card', { cardId: target.id, reason: 'duplicate' })
    expect(asked.isError).toBeUndefined()
    expect(store.getSnapshot().cards.length).toBe(before)

    const requestId = (asked.structuredContent as { requestId: string }).requestId
    expect(text(await call('get_approval', { requestId }))).toContain('Still waiting')

    // Only the interface can resolve it.
    store.resolveRequest(requestId, true)
    expect(store.getSnapshot().cards.length).toBe(before - 1)
    expect(text(await call('get_approval', { requestId }))).toContain('allowed')
  })

  it('leaves the card alone when the student denies', async () => {
    const before = store.getSnapshot().cards.length
    const target = firstCard()
    const asked = await call('delete_card', { cardId: target.id })
    const requestId = (asked.structuredContent as { requestId: string }).requestId
    store.resolveRequest(requestId, false)
    expect(store.getSnapshot().cards.length).toBe(before)
  })
})

describe('the study loop', () => {
  it('ranks weak topics from history, then drills them in that order', async () => {
    const weak = await call('get_weak_topics', { deck: 'Operating Systems' })
    const topics = (weak.structuredContent as { topics: Array<{ topic: string }> }).topics
    expect(topics[0]?.topic).toBe('Deadlock')

    await call('start_session', { deck: 'Operating Systems', mode: 'weak', limit: 4 })
    expect(store.currentCard()?.topic).toBe('Deadlock')

    await call('reveal_answer')
    expect(store.getSnapshot().session?.revealed).toBe(true)

    await call('grade_current_card', { grade: 'again' })
    expect(store.getSnapshot().session?.graded).toBe(1)
  })

  it('pins an explanation that then shows up in the impact report', async () => {
    await call('start_session', { deck: 'Operating Systems', mode: 'weak', limit: 4 })
    const cardId = store.currentCard()!.id
    await call('annotate_card', { cardId, note: 'A mnemonic.' })
    expect(store.card(cardId)?.note).toBe('A mnemonic.')
    expect(store.card(cardId)?.noteAddedAt).toBeTypeOf('number')

    const report = await call('get_note_impact', { deck: 'Operating Systems' })
    expect(text(report)).toContain('annotated card')
  })
})

describe('failure containment', () => {
  it('turns an unexpected exception into a usable tool result', async () => {
    const tool = tools.find((t) => t.name === 'get_weak_topics')!
    const original = store.weakTopics
    // Force the kind of failure no error path anticipates.
    store.weakTopics = () => {
      throw new Error('boom')
    }
    try {
      const r = await tool.execute({ deck: 'Operating' })
      expect(r.isError).toBe(true)
      expect(r.content[0]?.text).toContain('failed unexpectedly')
      expect(r.content[0]?.text).toContain('Nothing was changed')
    } finally {
      store.weakTopics = original
    }
  })
})
