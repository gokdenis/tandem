import { useState } from 'react'
import { useAppState } from '../core/useStore'
import { store, dateKey } from '../core/store'
import { DAY, isDue, difficulty } from '../core/srs'
import { CardManager } from './CardManager'
import { useNow } from '../core/useNow'

const heat = (d: number) => (d > 0.6 ? 'var(--bad)' : d > 0.35 ? 'var(--warn)' : 'var(--good)')

function Stat({
  value,
  label,
  tone,
  word,
}: {
  value: string
  label: string
  tone?: string | undefined
  /** A word needs more room than a number, so it is set smaller and may wrap. */
  word?: boolean | undefined
}) {
  return (
    <div className="stat">
      <div className={word ? 'stat-value word' : 'stat-value'} style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export function Dashboard({ onReplay }: { onReplay?: (() => void) | undefined }) {
  const state = useAppState()
  const now = useNow(60_000)
  const [selected, setSelected] = useState(state.decks[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const deckId = state.decks.some((d) => d.id === selected) ? selected : state.decks[0]?.id
  const deck = deckId ? store.deck(deckId) : undefined

  if (!deck) {
    return (
      <section className="panel">
        <p className="empty">
          No decks yet. Create one below, or ask your agent to build one from your notes.
        </p>
      </section>
    )
  }

  const cards = store.cardsOf(deck.id)
  const due = cards.filter((c) => isDue(c)).length
  const weak = store.weakTopics(deck.id)
  const plan = state.plan.filter((p) => p.deckId === deck.id)
  const days = deck.examAt ? Math.ceil((deck.examAt - now) / DAY) : null
  const annotated = store.annotated(deck.id)
  const helping = annotated.filter((a) => a.impact.verdict === 'helping').length
  const notLanding = annotated.filter((a) => a.impact.verdict === 'not landing').length

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
      <section className="panel hero">
        <div className="hero-top">
          <div>
            <p className="eyebrow">Studying</p>
            <h2 className="hero-title">{deck.name}</h2>
            <p className="hint">{deck.description}</p>
          </div>
          <div className="spacer" />
          {state.decks.length > 1 ? (
            <select
              className="deck-select"
              value={deck.id}
              onChange={(e) => setSelected(e.target.value)}
              aria-label="Choose a deck"
            >
              {state.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="stats">
          <Stat value={String(due)} label="cards due now" tone={due > 0 ? 'var(--human)' : undefined} />
          <Stat
            value={days !== null ? `${days}d` : 'not set'}
            label={days !== null ? 'until the exam' : 'exam date'}
            word={days === null}
            tone={days !== null && days <= 7 ? 'var(--warn)' : undefined}
          />
          <Stat
            value={weak[0]?.topic ?? 'none yet'}
            label="weakest topic"
            tone={weak[0] ? heat(weak[0].difficulty) : undefined}
            word
          />
          <Stat
            value={annotated.length ? `${helping}/${annotated.length}` : '0'}
            label="of your agent’s notes are working"
            tone={notLanding > 0 ? 'var(--warn)' : undefined}
          />
        </div>

        <div className="cta">
          <button className="btn lg primary" onClick={startDue} disabled={due === 0}>
            {due > 0 ? `Study ${due} due cards` : 'Nothing due today'}
          </button>
          <button className="btn lg" onClick={startWeak}>
            Drill your weakest topics
          </button>
          {onReplay ? (
            <button className="btn lg quiet" onClick={onReplay} title="Run the same tool calls an agent would make">
              Watch a replay
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Topics, weakest first</h2>
          <div className="spacer" />
          <p className="hint">from your grading history, not a guess</p>
        </div>

        {weak.map((t) => {
          const focused = state.focus?.topic?.toLowerCase() === t.topic.toLowerCase()
          return (
            <div key={t.topic} className={focused ? 'topic-row focused' : 'topic-row'}>
              <div className="t">{t.topic}</div>
              <div
                className="bar"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(t.difficulty * 100)}
                aria-label={`${t.topic} difficulty`}
              >
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
            <p className="hint">built by your agent, tick as you go</p>
          </div>
          <div className="plan">
            {plan.map((b) => (
              <label key={b.id} className={b.done ? 'plan-block done' : 'plan-block'}>
                <input type="checkbox" checked={b.done} onChange={() => store.togglePlanBlock(b.id, 'human')} />
                <span className="d">{b.date === dateKey(now) ? 'today' : b.date.slice(5)}</span>
                <span>{b.topics.join(' + ')}</span>
                <span className="m">{b.minutes} min</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <CardManager deckId={deck.id} />

      <section className="panel muted-panel">
        <div className="panel-head">
          <h2>Deck settings</h2>
        </div>
        <div className="form">
          <label className="hint" htmlFor="exam">
            Exam date
          </label>
          <input
            id="exam"
            type="date"
            className="narrow"
            value={deck.examAt ? dateKey(deck.examAt) : ''}
            onChange={(e) =>
              store.setExam(deck.id, e.target.value ? Date.parse(`${e.target.value}T09:00:00`) : null, 'human')
            }
          />
          <div className="spacer" />
          <button className="btn sm quiet" onClick={() => setCreating(!creating)}>
            {creating ? 'Cancel' : 'New deck'}
          </button>
          <button
            className="btn sm quiet"
            onClick={() => store.reset('human')}
            title="Replace everything here with the sample decks"
          >
            Restore sample decks
          </button>
          <button
            className="btn sm quiet danger"
            onClick={() => {
              if (state.decks.length <= 1) return
              store.deleteDeck(deck.id, 'human')
              setSelected(state.decks.find((d) => d.id !== deck.id)?.id ?? '')
            }}
            title={state.decks.length <= 1 ? 'Keep at least one deck' : 'Delete this deck and its cards'}
          >
            Delete deck
          </button>
        </div>
        {creating ? (
          <div className="form" style={{ marginTop: 12 }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Deck name" />
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What it covers" />
            <button
              className="btn sm primary"
              onClick={() => {
                if (!newName.trim()) return
                const created = store.createDeck(newName.trim(), newDesc.trim(), 'human')
                setSelected(created.id)
                setNewName('')
                setNewDesc('')
                setCreating(false)
              }}
            >
              Create
            </button>
          </div>
        ) : null}
      </section>
    </>
  )
}
