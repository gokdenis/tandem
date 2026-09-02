import { useState } from 'react'
import { tools, SESSION_ONLY, IDLE_ONLY, TOOL_GROUPS } from '../tools'
import { useAppState } from '../core/useStore'

function Hints({ name }: { name: string }) {
  const tool = tools.find((t) => t.name === name)
  const a = tool?.annotations
  if (!a) return null
  const chips: Array<[string, string]> = []
  if (a.readOnlyHint) chips.push(['read only', 'good'])
  else chips.push(['writes', 'neutral'])
  if (a.destructiveHint) chips.push(['destructive', 'bad'])
  if (a.idempotentHint) chips.push(['idempotent', 'neutral'])
  return (
    <div className="row" style={{ gap: 6, marginTop: 8 }}>
      {chips.map(([label, tone]) => (
        <span key={label} className={`impact ${tone}`} style={{ marginTop: 0 }}>
          {label}
        </span>
      ))}
    </div>
  )
}

export function ToolsPanel({ hasSession, connected }: { hasSession: boolean; connected: boolean }) {
  const { activity } = useAppState()
  const [open, setOpen] = useState<string | null>(null)
  const recent = new Set(activity.slice(0, 6).map((a) => a.tool).filter(Boolean) as string[])

  const isActive = (name: string) =>
    SESSION_ONLY.includes(name) ? hasSession : IDLE_ONLY.includes(name) ? !hasSession : true

  const selected = tools.find((t) => t.name === open)

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Tools this page exposes</h2>
        <div className="spacer" />
        <p className="hint">{tools.length} total</p>
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>
        {connected ? 'Registered on ' : 'These would be registered on '}
        <code style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>modelContext</code>
        {connected ? '. ' : ' once an agent is attached. '}
        The surface is not fixed: session controls are registered only while a card is on screen and withdrawn when it is
        not. Select one to read exactly what an agent sees.
      </p>
      {TOOL_GROUPS.map((group) => (
        <div key={group.label} className="tool-group">
          <p className="eyebrow">{group.label}</p>
          <div className="tools">
            {group.names.map((name) => {
              const active = isActive(name)
              return (
                <button
                  key={name}
                  className={`tool${recent.has(name) && active ? ' hot' : ''}${active ? '' : ' off'}${open === name ? ' open' : ''}`}
                  onClick={() => setOpen(open === name ? null : name)}
                  aria-expanded={open === name}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {selected ? (
        <div className="tool-detail">
          <div className="row">
            <code className="tool-name">{selected.name}</code>
            <div className="spacer" />
            <span className="hint">{isActive(selected.name) ? 'registered now' : 'withdrawn right now'}</span>
          </div>
          <p className="tool-desc">{selected.description}</p>
          <Hints name={selected.name} />
          <p className="hint" style={{ margin: '12px 0 6px' }}>Input schema</p>
          <pre className="schema">{JSON.stringify(selected.inputSchema, null, 2)}</pre>
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 12 }}>
          {connected
            ? 'Dimmed tools are currently withdrawn from the browser.'
            : 'Dimmed tools would be withdrawn in the current state.'}
        </p>
      )}
    </section>
  )
}
