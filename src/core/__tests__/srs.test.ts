import { describe, expect, it } from 'vitest'
import { DAY, difficulty, isDue, noteImpact, schedule } from '../srs'
import type { Card, Grade } from '../types'

const NOW = Date.UTC(2026, 8, 2)

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    deckId: 'd1',
    front: 'q',
    back: 'a',
    topic: 'General',
    ease: 2.5,
    interval: 0,
    reps: 0,
    lapses: 0,
    dueAt: NOW,
    history: [],
    createdBy: 'human',
    ...overrides,
  }
}

const history = (grades: Grade[], from = NOW - 10 * DAY) =>
  grades.map((grade, i) => ({ at: from + i * DAY, grade, by: 'human' as const }))

describe('schedule', () => {
  it('sends a missed card back into the same session and lowers its ease', () => {
    const next = schedule(card({ ease: 2.5, reps: 4, interval: 20 }), 'again', NOW)
    expect(next.lapses).toBe(1)
    expect(next.reps).toBe(0)
    expect(next.ease).toBeLessThan(2.5)
    expect(next.interval).toBe(0)
    expect(next.dueAt).toBe(NOW)
  })

  it('never lets ease fall below the 1.3 floor', () => {
    let c = card({ ease: 1.4 })
    for (let i = 0; i < 10; i++) c = schedule(c, 'again', NOW)
    expect(c.ease).toBe(1.3)
  })

  it('grows the interval and keeps easy ahead of good', () => {
    const good = schedule(schedule(schedule(card(), 'good', NOW), 'good', NOW), 'good', NOW)
    const easy = schedule(schedule(schedule(card(), 'easy', NOW), 'easy', NOW), 'easy', NOW)
    expect(good.interval).toBeGreaterThan(0)
    expect(easy.interval).toBeGreaterThan(good.interval)
  })

  it('records who graded and caps stored history', () => {
    let c = card()
    for (let i = 0; i < 60; i++) c = schedule(c, 'good', NOW)
    expect(c.history.length).toBeLessThanOrEqual(40)
    expect(c.history.at(-1)?.by).toBe('human')
  })
})

describe('difficulty', () => {
  it('treats an unseen card as genuinely unknown rather than easy', () => {
    expect(difficulty(card())).toBe(0.5)
  })

  it('ranks a repeatedly missed card above a reliably recalled one', () => {
    const bad = card({ ease: 1.4, history: history(['again', 'again', 'hard']) })
    const good = card({ ease: 2.7, history: history(['good', 'good', 'easy']) })
    expect(difficulty(bad)).toBeGreaterThan(difficulty(good))
    expect(difficulty(good)).toBeLessThan(0.2)
  })
})

describe('isDue', () => {
  it('is true only once the due date has passed', () => {
    expect(isDue(card({ dueAt: NOW - DAY }), NOW)).toBe(true)
    expect(isDue(card({ dueAt: NOW + DAY }), NOW)).toBe(false)
  })
})

describe('noteImpact', () => {
  it('returns nothing for a card with no explanation attached', () => {
    expect(noteImpact(card({ history: history(['again']) }))).toBeNull()
  })

  it('splits history on the moment the note was attached', () => {
    const addedAt = NOW - 5 * DAY
    const c = card({
      note: 'n',
      noteAddedAt: addedAt,
      history: [
        { at: addedAt - 2 * DAY, grade: 'again', by: 'human' },
        { at: addedAt - DAY, grade: 'again', by: 'human' },
        { at: addedAt + DAY, grade: 'good', by: 'human' },
        { at: addedAt + 2 * DAY, grade: 'good', by: 'human' },
        { at: addedAt + 3 * DAY, grade: 'easy', by: 'human' },
      ],
    })
    const impact = noteImpact(c)!
    expect(impact.beforeReviews).toBe(2)
    expect(impact.beforeMisses).toBe(2)
    expect(impact.afterReviews).toBe(3)
    expect(impact.afterMisses).toBe(0)
    expect(impact.delta).toBe(1)
    expect(impact.verdict).toBe('helping')
  })

  it('calls out an explanation that changed nothing', () => {
    const addedAt = NOW - 5 * DAY
    const c = card({
      note: 'n',
      noteAddedAt: addedAt,
      history: [
        { at: addedAt - DAY, grade: 'again', by: 'human' },
        { at: addedAt + DAY, grade: 'again', by: 'human' },
        { at: addedAt + 2 * DAY, grade: 'hard', by: 'human' },
      ],
    })
    expect(noteImpact(c)!.verdict).toBe('not landing')
  })

  it('withholds a verdict until there is enough evidence', () => {
    const addedAt = NOW - 2 * DAY
    const c = card({
      note: 'n',
      noteAddedAt: addedAt,
      history: [
        { at: addedAt - DAY, grade: 'again', by: 'human' },
        { at: addedAt + DAY, grade: 'good', by: 'human' },
      ],
    })
    expect(noteImpact(c)!.verdict).toBe('too early to tell')
  })
})
