import type { WebMCPStatus } from '../webmcp/adapter'
import { ThemePicker } from './ThemePicker'
import type { ThemeChoice } from '../core/theme'

export function Header({
  status,
  exposed,
  registered,
  theme,
  onTheme,
}: {
  status: WebMCPStatus
  exposed: number
  registered: number | null
  theme: ThemeChoice
  onTheme: (next: ThemeChoice) => void
}) {
  return (
    <header className="header">
      <div className="brand">
        <h1>Tandem</h1>
        <span>a study board you and your agent share</span>
      </div>
      <div className="spacer" />
      <ThemePicker value={theme} onChange={onTheme} />
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
