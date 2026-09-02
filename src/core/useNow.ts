import { useEffect, useState } from 'react'

/**
 * A clock that is stable within a render and still moves.
 *
 * Reading Date.now() inline during render gives two different answers in the
 * same pass, and freezes anything time-relative until the next unrelated state
 * change: "0s ago" stayed "0s ago", and a tab left open across midnight kept
 * calling yesterday "today".
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    // A tab that was backgrounded can be arbitrarily far behind on wake.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])

  return now
}
