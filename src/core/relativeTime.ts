/**
 * How long ago something happened, in words.
 *
 * The clock the interface renders against is sampled on an interval, so an
 * entry created since the last tick is a few seconds in the future and used to
 * render as "-2s ago".
 */
export function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${Math.round(seconds / 3600)}h ago`
}
