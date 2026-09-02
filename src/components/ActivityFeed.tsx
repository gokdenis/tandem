import { useAppState } from '../core/useStore'
import { useNow } from '../core/useNow'

/**
 * The clock is sampled on an interval, so an entry created since the last tick
 * is in the future by a few seconds and used to render as "-2s ago".
 */
export const ago = (t: number, now: number) => {
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

const LABEL = { agent: 'AGENT', replay: 'REPLAY', human: 'YOU' } as const

export function ActivityFeed() {
  const { activity } = useAppState()
  const now = useNow(15_000)

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Live activity</h2>
        <div className="spacer" />
        <p className="hint">who changed what</p>
      </div>
      {activity.length === 0 ? (
        <p className="hint">
          No changes yet. Everything you or your agent does to this board appears here, newest first, tagged with the
          tool that did it.
        </p>
      ) : (
        // The feed scrolls, so it has to be reachable and scrollable from the
        // keyboard as well as the mouse, not only by dragging it.
        <div className="feed" role="log" aria-live="polite" tabIndex={0} aria-label="Activity, newest first">
          {activity.slice(0, 30).map((a) => (
            <div className={`feed-item ${a.actor}`} key={a.id}>
              <span className={`badge ${a.actor}`}>{LABEL[a.actor]}</span>
              <div>
                <div className="msg">{a.message}</div>
                <div className="meta">
                  {ago(a.at, now)}
                  {a.tool ? (
                    <>
                      {' · '}
                      <code>{a.tool}</code>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
