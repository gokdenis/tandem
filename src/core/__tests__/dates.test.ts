import { describe, expect, it } from 'vitest'
import { dateKey } from '../store'

/**
 * These are regression tests for a real defect: dateKey used toISOString(),
 * which answers in UTC. Vitest runs with TZ set by the environment, so the
 * assertions below are written to hold in any zone rather than pinning one.
 */
describe('dateKey', () => {
  it('returns the local calendar day, not the UTC one', () => {
    const local = new Date(2026, 8, 14, 21, 30) // 14 September, half past nine at night
    expect(dateKey(local.getTime())).toBe('2026-09-14')
  })

  it('does not roll over early in the morning', () => {
    const local = new Date(2026, 8, 14, 0, 30)
    expect(dateKey(local.getTime())).toBe('2026-09-14')
  })

  it('round trips the value an exam date input produces', () => {
    const parsed = Date.parse('2026-09-14T09:00:00') // how set_exam_date reads it
    expect(dateKey(parsed)).toBe('2026-09-14')
  })

  it('pads single digit months and days', () => {
    expect(dateKey(new Date(2026, 0, 5, 12).getTime())).toBe('2026-01-05')
  })
})
