import type { WebMCPStatus } from '../webmcp/adapter'
import { toolNames } from '../tools'

export function Header({ status }: { status: WebMCPStatus }) {
  return (
    <header className="header">
      <div className="brand">
        <h1>Tandem</h1>
        <span>a study board you and your agent share</span>
      </div>
      <div className="spacer" />
      <span className="pill">{toolNames.length} tools exposed</span>
      <span className={status.supported ? 'pill live' : 'pill'}>
        <i className="dot" />
        {status.supported ? `WebMCP connected · ${status.surface}` : 'WebMCP not detected'}
      </span>
    </header>
  )
}
