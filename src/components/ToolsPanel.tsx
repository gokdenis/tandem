import { tools } from '../tools'
import { useAppState } from '../core/useStore'

export function ToolsPanel() {
  const { activity } = useAppState()
  const recent = new Set(activity.slice(0, 6).map((a) => a.tool).filter(Boolean) as string[])

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Tools this page exposes</h2>
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>
        Registered on <code style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>modelContext</code>. An agent calls these
        directly and never has to click through the interface.
      </p>
      <div className="tools">
        {tools.map((t) => (
          <span key={t.name} className={recent.has(t.name) ? 'tool hot' : 'tool'} title={t.description}>
            {t.name}
          </span>
        ))}
      </div>
    </section>
  )
}
