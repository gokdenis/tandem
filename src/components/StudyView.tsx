import { useEffect } from 'react'
import { useAppState } from '../core/useStore'
import { store } from '../core/store'
import { noteImpact } from '../core/srs'
import type { Grade } from '../core/types'

const GRADES: Array<{ g: Grade; label: string; hint: string; key: string }> = [
  { g: 'again', label: 'Again', hint: 'missed it', key: '1' },
  { g: 'hard', label: 'Hard', hint: 'struggled', key: '2' },
  { g: 'good', label: 'Good', hint: 'recalled it', key: '3' },
  { g: 'easy', label: 'Easy', hint: 'instant', key: '4' },
]

export function StudyView() {
  const state = useAppState()
  const session = state.session!
  const card = store.currentCard()
  const startedFromDeck = store.deck(session.deckId)
  const deck = card ? store.deck(card.deckId) : startedFromDeck
  const queueDeckIds = new Set(
    session.queue.map((id) => store.card(id)?.deckId).filter((id): id is string => Boolean(id)),
  )
  const mixedDecks = queueDeckIds.size > 1 || (deck !== undefined && deck.id !== session.deckId)
  const pct = session.queue.length ? Math.min(100, (session.index / session.queue.length) * 100) : 0
  const focused =
    !!card &&
    (state.focus?.cardId === card.id || state.focus?.topic?.toLowerCase() === card.topic.toLowerCase())

  const revealed = session.revealed
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!store.currentCard()) return
      if (!revealed && (e.code === 'Space' || e.key === 'Enter')) {
        e.preventDefault()
        store.reveal('human')
        return
      }
      if (revealed) {
        const hit = GRADES.find((g) => g.key === e.key)
        if (hit) {
          e.preventDefault()
          store.grade(hit.g, 'human')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed])

  const upNext = session.queue
    .slice(session.index + 1, session.index + 6)
    .map((id) => store.card(id))
    .filter(Boolean)

  return (
    <section className="panel study">
      <div className="study-top">
        <button className="btn sm ghost" onClick={() => store.endSession('human')}>
          ← Back
        </button>
        <span className="pill">
          {deck?.name} · {session.label}
          {mixedDecks ? ' · mixed queue' : ''}
        </span>
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={session.queue.length}
          aria-valuenow={session.index}
          aria-label="Cards completed in this session"
        >
          <i style={{ width: `${pct}%` }} />
        </div>
        <span className="hint">
          {Math.min(session.index + 1, session.queue.length)} / {session.queue.length} · {session.correct}/
          {session.graded} correct
        </span>
      </div>

      {!card ? (
        <div className="card">
          <p className="empty">
            Queue finished. {session.correct} of {session.graded} correct.
            <br />
            <br />
            <button className="btn primary" onClick={() => store.endSession('human')}>
              Finish
            </button>
          </p>
        </div>
      ) : (
        <>
          <div className={focused ? 'card focused' : 'card'}>
            <div className="row">
              <span className="topic-chip">{card.topic}</span>
              {focused && state.focus?.reason ? <span className="focus-tag">{state.focus.reason}</span> : null}
            </div>
            <p className="front">{card.front}</p>

            {revealed ? (
              <>
                <p className="back">{card.back}</p>
                {card.note ? (
                  <div className="note">
                    <span className="who">explanation from your agent</span>
                    {card.note}
                    {(() => {
                      const impact = noteImpact(card)
                      if (!impact || impact.verdict === 'too early to tell') return null
                      return (
                        <div>
                          <span className={`impact ${impact.verdict === 'helping' ? 'good' : 'bad'}`}>
                            {impact.verdict}: missed {impact.beforeMisses}/{impact.beforeReviews} before this note,{' '}
                            {impact.afterMisses}/{impact.afterReviews} after
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                ) : null}
              </>
            ) : (
              <div style={{ marginTop: 'auto' }}>
                <button className="btn primary" onClick={() => store.reveal('human')}>
                  Show answer
                </button>
                <span className="hint" style={{ marginLeft: 12 }}>
                  or press space
                </span>
              </div>
            )}
          </div>

          {revealed ? (
            <div className="grades">
              {GRADES.map((g) => (
                <button key={g.g} className={`grade ${g.g}`} onClick={() => store.grade(g.g, 'human')}>
                  {g.label}
                  <small>
                    {g.hint} · {g.key}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <p className="hint">
              Answer out loud first. Your agent can see this exact card, so if you say “I don’t get this one” it will explain
              it and pin the explanation here for next time.
            </p>
          )}

          {upNext.length > 0 ? (
            <div>
              <p className="hint" style={{ marginBottom: 8 }}>
                Up next in the queue, which your agent can reorder at any time
              </p>
              <div className="tools">
                {upNext.map((c) => {
                  const queuedDeck = store.deck(c!.deckId)
                  return (
                    <span key={c!.id} className="queue-chip" title={c!.front}>
                      <b>{queuedDeck?.id !== deck?.id ? `${queuedDeck?.name ?? 'Unknown deck'} · ` : ''}{c!.topic}</b>
                      {c!.front.length > 38 ? `${c!.front.slice(0, 38)}…` : c!.front}
                    </span>
                  )
                })}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
