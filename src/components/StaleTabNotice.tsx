import { store } from '../core/store'

/**
 * Browser storage is shared across tabs and the last writer wins. Rather than
 * letting two tabs quietly overwrite one another, the tab that did not write
 * says so and lets the student choose when to pick the newer workspace up.
 */
export function StaleTabNotice() {
  return (
    <div className="banner" role="status">
      <b>This workspace changed in another tab.</b> What you see here is an older copy, and saving from this tab will
      overwrite the newer one.
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn sm primary" onClick={() => store.adoptStoredWorkspace()}>
          Load the newer version
        </button>
        <button className="btn sm quiet" onClick={() => store.keepCurrentWorkspace()}>
          Keep this one
        </button>
      </div>
    </div>
  )
}
