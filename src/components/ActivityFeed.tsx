import { useAppState } from '../core/useStore'

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

const LABEL = { agent: 'AGENT', replay: 'REPLAY', human: 'YOU' } as const

export function ActivityFeed() {
  const { activity } = useAppState()

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
        <div className="feed" role="log" aria-live="polite">
          {activity.slice(0, 30).map((a) => (
            <div className={`feed-item ${a.actor}`} key={a.id}>
              <span className={`badge ${a.actor}`}>{LABEL[a.actor]}</span>
              <div>
                <div className="msg">{a.message}</div>
                <div className="meta">
                  {ago(a.at)}
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
