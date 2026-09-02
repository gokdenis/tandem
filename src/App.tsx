import { useEffect, useRef, useState } from 'react'
import {
  browserToolCount,
  detectWebMCP,
  onToolChange,
  ToolRegistry,
  type WebMCPStatus,
} from './webmcp/adapter'
import { activeTools } from './tools'
import { useAppState } from './core/useStore'
import { useTheme } from './core/theme'
import { Header } from './components/Header'
import { SetupBanner } from './components/SetupBanner'
import { Dashboard } from './components/Dashboard'
import { StudyView } from './components/StudyView'
import { ActivityFeed } from './components/ActivityFeed'
import { ToolsPanel } from './components/ToolsPanel'
import { ReplayBar } from './components/ReplayBar'
import { ApprovalPrompt } from './components/ApprovalPrompt'
import { StorageNotice } from './components/StorageNotice'
import { StaleTabNotice } from './components/StaleTabNotice'
import { REPLAY_STEPS, runReplay } from './replay/script'

export default function App() {
  const state = useAppState()
  const [theme, setTheme] = useTheme()
  const [status, setStatus] = useState<WebMCPStatus>({ supported: false, reason: 'checking…' })
  /** What the browser itself reports through getTools(), not our own count. */
  const [registered, setRegistered] = useState<number | null>(null)
  const registry = useRef<ToolRegistry | null>(null)
  const [replayStep, setReplayStep] = useState<number | null>(null)
  const replayAbort = useRef<AbortController | null>(null)

  const startReplay = () => {
    replayAbort.current?.abort()
    const controller = new AbortController()
    replayAbort.current = controller
    setReplayStep(0)
    void runReplay(setReplayStep, controller.signal).finally(() => {
      if (!controller.signal.aborted) setReplayStep(null)
    })
  }

  const stopReplay = () => {
    replayAbort.current?.abort()
    replayAbort.current = null
    setReplayStep(null)
  }

  const hasSession = state.session !== null
  const pending = state.requests.find((r) => r.status === 'pending')
  const currentReplayStep = replayStep === null ? undefined : REPLAY_STEPS[replayStep]
  const storage = state.storage

  useEffect(() => {
    let cancelled = false
    let tries = 0

    // An in-app browser can install modelContext slightly after first paint,
    // so poll briefly instead of deciding on the very first tick.
    const attach = async () => {
      const detected = detectWebMCP()
      if (!detected.supported && tries < 12) {
        tries += 1
        setStatus(detected)
        setTimeout(attach, 250)
        return
      }
      if (cancelled) return
      setStatus(detected)
      if (detected.supported && !registry.current) {
        registry.current = new ToolRegistry()
        await registry.current.sync(activeTools(hasSession))
        setRegistered(await browserToolCount())
      }
    }
    void attach()

    const off = onToolChange(async () => {
      if (!cancelled) setRegistered(await browserToolCount())
    })

    return () => {
      cancelled = true
      off()
      registry.current?.dispose()
      registry.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The tool surface follows application state: session controls appear when a
  // card is on screen and withdraw when it is not.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!registry.current) return
      await registry.current.sync(activeTools(hasSession))
      if (!cancelled) setRegistered(await browserToolCount())
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [hasSession, status.supported])

  return (
    <div className="app">
      <a className="skip-link" href="#workspace">
        Skip to the study board
      </a>
      <Header
        status={status}
        exposed={activeTools(hasSession).length}
        registered={registered}
        theme={theme}
        onTheme={setTheme}
      />
      <div className="body">
        <main className="main" id="workspace" aria-label="Study board">
          {state.staleTab ? (
            <>
              <StaleTabNotice />
              <div style={{ height: 16 }} />
            </>
          ) : null}
          {storage !== 'ok' ? (
            <>
              <StorageNotice status={storage} />
              <div style={{ height: 16 }} />
            </>
          ) : null}
          {pending ? (
            <>
              <ApprovalPrompt request={pending} />
              <div style={{ height: 16 }} />
            </>
          ) : null}
          {currentReplayStep ? (
            <>
              <ReplayBar index={replayStep ?? 0} step={currentReplayStep} onStop={stopReplay} />
              <div style={{ height: 16 }} />
            </>
          ) : null}
          {!status.supported && replayStep === null ? (
            <>
              <SetupBanner onReplay={startReplay} />
              <div style={{ height: 16 }} />
            </>
          ) : null}
          {state.session ? <StudyView /> : <Dashboard onReplay={replayStep === null ? startReplay : undefined} />}
        </main>
        <aside className="rail" aria-label="Agent activity and tools">
          <ActivityFeed />
          <ToolsPanel hasSession={hasSession} connected={status.supported} />
        </aside>
      </div>
    </div>
  )
}
