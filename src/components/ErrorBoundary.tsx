import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * A study workspace lives in localStorage, so a bad stored snapshot could
 * otherwise white-screen the page with no way out. This keeps the app
 * explainable and always offers the one action that fixes it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[tandem] unhandled error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="app">
        <header className="header">
          <div className="brand">
            <h1>Tandem</h1>
            <span>a study board you and your agent share</span>
          </div>
        </header>
        <div className="body" style={{ gridTemplateColumns: 'minmax(0, 720px)' }}>
          <main className="main">
            <section className="panel">
              <div className="panel-head">
                <h2>Something in the page broke</h2>
              </div>
              <p className="hint">
                Your decks are stored in this browser, so the quickest fix is to restore the sample workspace and
                reload. Nothing leaves your machine either way.
              </p>
              <pre className="schema" style={{ marginTop: 12 }}>
                {this.state.error.message}
              </pre>
              <div className="row" style={{ marginTop: 14 }}>
                <button
                  className="btn sm primary"
                  onClick={() => {
                    try {
                      localStorage.removeItem('tandem.state.v2')
                    } catch {
                      /* private mode */
                    }
                    location.reload()
                  }}
                >
                  Reset workspace and reload
                </button>
                <button className="btn sm" onClick={() => location.reload()}>
                  Just reload
                </button>
              </div>
            </section>
          </main>
        </div>
      </div>
    )
  }
}
