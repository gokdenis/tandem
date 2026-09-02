import { store } from '../core/store'

/**
 * Losing work silently is worse than losing it loudly. Private windows and a
 * full origin quota both make writes throw, and until now the app carried on
 * as if everything had been saved.
 */
export function StorageNotice({ status }: { status: 'full' | 'unavailable' }) {
  return (
    <div className="banner" role="status">
      <b>{status === 'full' ? 'This browser is out of storage space.' : 'This browser is not saving anything.'}</b>{' '}
      {status === 'full'
        ? 'Your workspace has outgrown what a browser will keep. Delete some cards, or export what you need, before you close the tab.'
        : 'Private windows and blocked site data stop the workspace being written. Everything still works, but it will be gone when you close the tab.'}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn sm" onClick={() => store.persistNow()}>
          Try saving again
        </button>
      </div>
    </div>
  )
}
