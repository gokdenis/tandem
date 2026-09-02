import { useState } from 'react'
import { useAppState } from '../core/useStore'
import { store, dateKey } from '../core/store'
import { DAY, isDue, difficulty } from '../core/srs'

const heat = (d: number) =>
  d > 0.6 ? 'var(--bad)' : d > 0.35 ? 'var(--warn)' : 'var(--good)'

export function Dashboard() {
  const state = useAppState()
  const [selected, setSelected] = useState(state.decks[0]?.id ?? '')
  const deckId = state.decks.some((d) => d.id === selected) ? selected : state.decks[0]?.id
  const deck = deckId ? store.deck(deckId) : undefined

  if (!deck) {
    return (
      <section className="panel">
        <p className="empty">No decks yet. Ask your agent to make one, or reload for the demo data.</p>
      </section>
    )
  }

  const cards = store.cardsOf(deck.id)
  const due = cards.filter((c) => isDue(c)).length
  const weak = store.weakTopics(deck.id)
  const plan = state.plan.filter((p) => p.deckId === deck.id)
  const days = deck.examAt ? Math.ceil((deck.examAt - Date.now()) / DAY) : null

  const startDue = () => {
    const queue = cards.filter((c) => isDue(c)).sort((a, b) => a.dueAt - b.dueAt).slice(0, 12)
    if (queue.length) store.startSession(deck.id, queue.map((c) => c.id), 'due today', 'human')
  }
  const startWeak = () => {
    const queue = [...cards].sort((a, b) => difficulty(b) - difficulty(a)).slice(0, 12)
    if (queue.length) store.startSession(deck.id, queue.map((c) => c.id), 'weakest first', 'human')
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Decks</h2>
        </div>
        <div className="decks">
          {state.decks.map((d) => (
            <button
              key={d.id}
              className={d.id === deck.id ? 'deck active' : 'deck'}
              onClick={() => setSelected(d.id)}
            >
              <div className="grow">
                <div className="name">{d.name}</div>
                <div className="sub">
                  {store.cardsOf(d.id).length} cards · {store.dueCount(d.id)} due now
                </div>
              </div>
              {d.examAt ? (
                <div className="countdown">
                  <b>{Math.max(0, Math.ceil((d.examAt - Date.now()) / DAY))}d</b>
                  to exam
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{deck.name}</h2>
          <div className="spacer" />
          <button className="btn sm" onClick={startWeak}>
            Drill weakest
          </button>
          <button className="btn sm primary" onClick={startDue} disabled={due === 0}>
            Study {due} due
          </button>
        </div>
        <p className="hint">
          {deck.description}
          {days !== null ? ` · exam ${dateKey(deck.examAt!)}, ${days} day${days === 1 ? '' : 's'} away` : ''}
        </p>

        <div className="sep" />

        <div className="panel-head">
          <h2>Topics, weakest first</h2>
          <div className="spacer" />
          <p className="hint">from real grading history</p>
        </div>

        {weak.map((t) => {
          const focused = state.focus?.topic?.toLowerCase() === t.topic.toLowerCase()
          return (
            <div key={t.topic} className={focused ? 'topic-row focused' : 'topic-row'}>
              <div className="t">{t.topic}</div>
              <div className="bar">
                <i style={{ width: `${Math.round(t.difficulty * 100)}%`, background: heat(t.difficulty) }} />
              </div>
              <div className="row">
                {focused && state.focus?.reason ? <span className="focus-tag">{state.focus.reason}</span> : null}
                <span className="n">
                  {t.lapses} lapse{t.lapses === 1 ? '' : 's'} / {t.cards} cards
                </span>
              </div>
            </div>
          )
        })}
      </section>

      {plan.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Revision plan</h2>
            <div className="spacer" />
            <p className="hint">built by your agent · tick as you go</p>
          </div>
          <div className="plan">
            {plan.map((b) => (
              <label key={b.id} className={b.done ? 'plan-block done' : 'plan-block'}>
                <input type="checkbox" checked={b.done} onChange={() => store.togglePlanBlock(b.id, 'human')} />
                <span className="d">{b.date === dateKey(Date.now()) ? 'today' : b.date.slice(5)}</span>
                <span>{b.topics.join(' + ')}</span>
                <span className="m">{b.minutes} min</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}
