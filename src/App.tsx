import { useEffect, useState } from 'react'
import { detectWebMCP, registerTools, type WebMCPStatus } from './webmcp/adapter'
import { tools } from './tools'
import { useAppState } from './core/useStore'
import { Header } from './components/Header'
import { SetupBanner } from './components/SetupBanner'
import { Dashboard } from './components/Dashboard'
import { StudyView } from './components/StudyView'
import { ActivityFeed } from './components/ActivityFeed'
import { ToolsPanel } from './components/ToolsPanel'

// React 18/19 StrictMode mounts effects twice in development; registering the
// same tool set twice would show duplicates to the agent.
let registered = false

export default function App() {
  const state = useAppState()
  const [status, setStatus] = useState<WebMCPStatus>({ supported: false, reason: 'checking…' })

  useEffect(() => {
    let cancelled = false
    let unregister: (() => void) | undefined

    // The in-app browser can install modelContext slightly after first paint,
    // so poll briefly rather than deciding on the very first tick.
    let tries = 0
    const attach = async () => {
      const detected = detectWebMCP()
      if (!detected.supported && tries < 12) {
        tries += 1
        setTimeout(attach, 250)
        setStatus(detected)
        return
      }
      if (cancelled) return
      setStatus(detected)
      if (detected.supported && !registered) {
        registered = true
        unregister = await registerTools(tools)
      }
    }
    void attach()

    return () => {
      cancelled = true
      if (unregister) {
        unregister()
        registered = false
      }
    }
  }, [])

  return (
    <div className="app">
      <Header status={status} />
      <div className="body">
        <main className="main">
          {!status.supported ? <SetupBanner /> : null}
          {!status.supported ? <div style={{ height: 16 }} /> : null}
          {state.session ? <StudyView /> : <Dashboard />}
        </main>
        <aside className="rail">
          <ActivityFeed />
          <ToolsPanel />
        </aside>
      </div>
    </div>
  )
}
