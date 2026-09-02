import { store } from '../core/store'
import type { ApprovalRequest } from '../core/types'

/**
 * The only path from an agent's request to a destructive change. An agent can
 * ask, and can read the answer, but it cannot press either of these buttons.
 */
export function ApprovalPrompt({ request }: { request: ApprovalRequest }) {
  return (
    <div className="approval" role="alertdialog" aria-labelledby="approval-title">
      <div className="approval-head">
        <span className="approval-tag">PERMISSION</span>
        <span className="hint">Your agent is asking. It cannot do this on its own.</span>
      </div>
      <p id="approval-title" className="approval-summary">
        {request.summary}
      </p>
      <p className="hint">This would permanently lose {request.cost}.</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn sm primary" onClick={() => store.resolveRequest(request.id, true)}>
          Allow
        </button>
        <button className="btn sm" onClick={() => store.resolveRequest(request.id, false)}>
          Deny
        </button>
      </div>
    </div>
  )
}
