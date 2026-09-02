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
