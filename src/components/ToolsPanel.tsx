import { tools, SESSION_ONLY, IDLE_ONLY } from '../tools'
import { useAppState } from '../core/useStore'

export function ToolsPanel({ hasSession }: { hasSession: boolean }) {
  const { activity } = useAppState()
  const recent = new Set(activity.slice(0, 6).map((a) => a.tool).filter(Boolean) as string[])

  const isActive = (name: string) =>
    SESSION_ONLY.includes(name) ? hasSession : IDLE_ONLY.includes(name) ? !hasSession : true

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Tools this page exposes</h2>
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>
        Registered on <code style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>modelContext</code>. The surface is not
        fixed: session controls are registered only while a card is on screen and withdrawn when it is not, so an agent is
        never offered a control it cannot use.
      </p>
      <div className="tools">
        {tools.map((t) => {
          const active = isActive(t.name)
          return (
            <span
              key={t.name}
              className={`tool${recent.has(t.name) && active ? ' hot' : ''}${active ? '' : ' off'}`}
              title={active ? t.description : `Withdrawn right now: ${t.description}`}
            >
              {t.name}
            </span>
          )
        })}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Dimmed tools are currently withdrawn from the browser.
      </p>
    </section>
  )
}
