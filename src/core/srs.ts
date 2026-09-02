import type { Card, Grade } from './types'

export const DAY = 86_400_000

/**
 * A compact SM-2 variant. Chosen over "N days from now" scheduling because the
 * agent needs a real signal to reason about: `ease` and `lapses` are what make
 * `get_weak_topics` meaningful rather than a guess.
 */
export function schedule(card: Card, grade: Grade, now = Date.now()): Card {
  let { ease, interval, reps, lapses } = card

  if (grade === 'again') {
    lapses += 1
    reps = 0
    ease = Math.max(1.3, ease - 0.2)
    interval = 0 // re-show inside the same session
  } else {
    const bonus = grade === 'easy' ? 0.15 : grade === 'hard' ? -0.15 : 0
    ease = Math.min(3.0, Math.max(1.3, ease + bonus))
    reps += 1
    if (reps === 1) interval = grade === 'easy' ? 3 : 1
    else if (reps === 2) interval = grade === 'easy' ? 6 : 3
    else interval = Math.round(interval * ease * (grade === 'hard' ? 0.7 : 1))
    interval = Math.max(1, interval)
  }

  return {
    ...card,
    ease,
    interval,
    reps,
    lapses,
    dueAt: now + interval * DAY,
    history: [...card.history, { at: now, grade, by: 'human' as const }].slice(-40),
  }
}

/** 0 = never missed, 1 = always missed. Used for weak-topic ranking. */
export function difficulty(card: Card): number {
  const recent = card.history.slice(-8)
  if (recent.length === 0) return 0.5 // unseen cards are genuinely unknown
  const misses = recent.filter((h) => h.grade === 'again' || h.grade === 'hard').length
  const easeGap = (2.5 - card.ease) / 1.2 // 0 when ease is healthy, ~1 when floored
  return Math.min(1, 0.65 * (misses / recent.length) + 0.35 * Math.max(0, easeGap))
}

export const isDue = (card: Card, now = Date.now()) => card.dueAt <= now

export type NoteImpact = {
  beforeReviews: number
  beforeMisses: number
  afterReviews: number
  afterMisses: number
  /** Miss rate before minus miss rate after. Positive means the note helped. */
  delta: number | null
  verdict: 'helping' | 'not landing' | 'too early to tell'
}

/**
 * Did the explanation attached to this card actually change anything?
 *
 * This is the point of writing a note into durable state instead of saying it
 * once in chat: the same history that drives scheduling also tells us whether
 * the explanation worked, so the agent can rewrite the ones that did not land.
 */
export function noteImpact(card: Card): NoteImpact | null {
  if (!card.note || !card.noteAddedAt) return null
  const before = card.history.filter((h) => h.at < card.noteAddedAt!)
  const after = card.history.filter((h) => h.at >= card.noteAddedAt!)
  const missed = (list: typeof card.history) => list.filter((h) => h.grade === 'again' || h.grade === 'hard').length

  const beforeMisses = missed(before)
  const afterMisses = missed(after)
  const beforeRate = before.length ? beforeMisses / before.length : null
  const afterRate = after.length ? afterMisses / after.length : null

  const delta = beforeRate !== null && afterRate !== null ? Number((beforeRate - afterRate).toFixed(2)) : null

  let verdict: NoteImpact['verdict'] = 'too early to tell'
  if (after.length >= 2) verdict = afterMisses === 0 || (delta !== null && delta > 0.2) ? 'helping' : 'not landing'

  return { beforeReviews: before.length, beforeMisses, afterReviews: after.length, afterMisses, delta, verdict }
}
