import type { WebMCPStatus } from '../webmcp/adapter'

export function Header({
  status,
  exposed,
  registered,
}: {
  status: WebMCPStatus
  exposed: number
  registered: number | null
}) {
  return (
    <header className="header">
      <div className="brand">
        <h1>Tandem</h1>
        <span>a study board you and your agent share</span>
      </div>
      <div className="spacer" />
      <span className="pill" title="The tool surface changes with what the app is doing.">
        <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{exposed}</b>
        &nbsp;tools exposed
        {registered !== null ? <span style={{ color: 'var(--dim)' }}>&nbsp;· {registered} live</span> : null}
      </span>
      <span className={status.supported ? 'pill live' : 'pill'}>
        <i className="dot" />
        {status.supported ? `WebMCP connected · ${status.surface}` : 'WebMCP not detected'}
      </span>
    </header>
  )
}
