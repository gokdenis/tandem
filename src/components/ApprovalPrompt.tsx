import { store } from '../core/store'
import type { ApprovalRequest } from '../core/types'

/**
 * The only path from an agent's request to a destructive change. An agent can
 * ask, and can read the answer, but it cannot press either of these buttons.
 */
export function ApprovalPrompt({ request }: { request: ApprovalRequest }) {
  return (
    <section className="approval" aria-labelledby="approval-title" aria-live="assertive">
      <div className="approval-head">
        <span className="approval-tag">PERMISSION</span>
        <span className="hint">Your agent is asking. It cannot do this on its own.</span>
      </div>
      <h2 id="approval-title" className="approval-summary">
        {request.summary}
      </h2>
      <p className="hint">{request.cost}</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => store.resolveRequest(request.id, false)}>
          {request.denyLabel}
        </button>
        <button className="btn danger-solid" onClick={() => store.resolveRequest(request.id, true)}>
          {request.allowLabel}
        </button>
      </div>
    </section>
  )
}
