import { REPLAY_STEPS, type ReplayStep } from '../replay/script'

export function ReplayBar({ index, step, onStop }: { index: number; step: ReplayStep; onStop: () => void }) {
  return (
    <div className="replay-bar" role="status" aria-live="polite">
      <div className="replay-head">
        <span className="replay-tag">REPLAY</span>
        <span className="hint">
          Scripted tool calls running in a temporary demo workspace. Your own decks return when it stops.
        </span>
        <div className="spacer" />
        <span className="hint" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {index + 1} / {REPLAY_STEPS.length}
        </span>
        <button className="btn sm ghost" onClick={onStop}>
          Stop
        </button>
      </div>
      <div className={`replay-line ${step.from}`}>
        <span className="who">{step.from === 'student' ? 'student' : 'agent'}</span>
        <span className="said">{step.say}</span>
        {step.tool ? <code>{step.tool}</code> : null}
      </div>
      <div className="replay-progress">
        <i style={{ width: `${((index + 1) / REPLAY_STEPS.length) * 100}%` }} />
      </div>
    </div>
  )
}
