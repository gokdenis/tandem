import { useAppState } from '../core/useStore'
import { useNow } from '../core/useNow'
import { ago } from '../core/relativeTime'


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
