import { useState } from 'react'
import { store } from '../core/store'
import { noteImpact } from '../core/srs'
import type { Card } from '../core/types'

function ImpactBadge({ card }: { card: Card }) {
  const impact = noteImpact(card)
  if (!impact) return null
  const tone = impact.verdict === 'helping' ? 'good' : impact.verdict === 'not landing' ? 'bad' : 'neutral'
  return (
    <span className={`impact ${tone}`}>
      {impact.verdict === 'too early to tell'
        ? `note added, ${impact.afterReviews} review${impact.afterReviews === 1 ? '' : 's'} since`
        : `${impact.verdict}: missed ${impact.beforeMisses}/${impact.beforeReviews} before, ${impact.afterMisses}/${impact.afterReviews} after`}
    </span>
  )
}

function CardRow({ card }: { card: Card }) {
  const [editing, setEditing] = useState(false)
  const [front, setFront] = useState(card.front)
  const [back, setBack] = useState(card.back)
  const [topic, setTopic] = useState(card.topic)

  if (editing) {
    return (
      <div className="card-row editing">
        <input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Question" aria-label="Question" />
        <input value={back} onChange={(e) => setBack(e.target.value)} placeholder="Answer" aria-label="Answer" />
        <input className="narrow" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic" aria-label="Topic" />
        <div className="row">
          <button
            className="btn sm primary"
            onClick={() => {
              if (!front.trim() || !back.trim()) return
              store.updateCard(card.id, { front: front.trim(), back: back.trim(), topic: topic.trim() || 'General' }, 'human')
              setEditing(false)
            }}
          >
            Save
          </button>
          <button className="btn sm ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card-row">
      <div className="grow">
        <div className="q">
          <span className="tag">{card.topic}</span>
          {card.front}
        </div>
        <div className="a">{card.back}</div>
        {card.note ? (
          <div className="row-note">
            <span className="who">explanation from your agent</span>
            {card.note}
            <ImpactBadge card={card} />
          </div>
        ) : null}
      </div>
      <div className="row">
        <button className="btn sm quiet" onClick={() => setEditing(true)} aria-label={`Edit card: ${card.front}`}>
          Edit
        </button>
        <button
          className="btn sm quiet danger"
          onClick={() => store.deleteCard(card.id, 'human')}
          aria-label={`Delete card: ${card.front}`}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

const PAGE = 25

export function CardManager({ deckId }: { deckId: string }) {
  const [mode, setMode] = useState<'none' | 'one' | 'bulk'>('none')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [topic, setTopic] = useState('')
  const [bulk, setBulk] = useState('')
  const [query, setQuery] = useState('')
  const [shownCount, setShownCount] = useState(PAGE)

  const all = store.cardsOf(deckId)
  const needle = query.trim().toLowerCase()
  const cards = needle
    ? all.filter((c) => [c.front, c.back, c.topic, c.note ?? ''].some((f) => f.toLowerCase().includes(needle)))
    : all
  // Rendering every row at once froze the page for a second and a half on a
  // two thousand card deck, so the list grows a page at a time.
  const shown = cards.slice(0, shownCount)

  const addOne = () => {
    if (!front.trim() || !back.trim()) return
    store.addCards(deckId, [{ front: front.trim(), back: back.trim(), topic: topic.trim() || 'General' }], 'human')
    setFront('')
    setBack('')
  }

  const addBulk = () => {
    const rows = bulk
      .split('\n')
      .map((line) => line.split('|').map((p) => p.trim()))
      .flatMap(([front, back, topic]) =>
        front && back ? [{ front, back, topic: topic || 'General' }] : [],
      )
    if (rows.length === 0) return
    store.addCards(deckId, rows, 'human')
    setBulk('')
    setMode('none')
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Cards ({all.length})</h2>
        <div className="spacer" />
        {all.length > PAGE ? (
          <input
            className="narrow"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setShownCount(PAGE)
            }}
            placeholder="Filter cards"
            aria-label="Filter cards"
          />
        ) : null}
        <button className="btn sm" onClick={() => setMode(mode === 'one' ? 'none' : 'one')}>
          Add card
        </button>
        <button className="btn sm" onClick={() => setMode(mode === 'bulk' ? 'none' : 'bulk')}>
          Paste notes
        </button>
      </div>

      {mode === 'one' ? (
        <div className="form">
          <input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Question" aria-label="New card question" />
          <input value={back} onChange={(e) => setBack(e.target.value)} placeholder="Answer" aria-label="New card answer" />
          <input className="narrow" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic" aria-label="New card topic" />
          <button className="btn sm primary" onClick={addOne}>
            Add
          </button>
        </div>
      ) : null}

      {mode === 'bulk' ? (
        <div className="form vertical">
          <p className="hint">
            One card per line, as <code>question | answer | topic</code>. Your agent can do this too, from raw lecture
            notes, with add_cards.
          </p>
          <textarea
            aria-label="Cards to add, one per line"
            rows={5}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={'What is a page fault? | A trap raised when a referenced page is not resident. | Virtual memory'}
          />
          <div className="row">
            <button className="btn sm primary" onClick={addBulk}>
              Add all
            </button>
            <button className="btn sm ghost" onClick={() => setMode('none')}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {cards.length === 0 ? (
        <p className="hint">
          {needle
            ? `No cards match “${query}”.`
            : 'No cards yet. Add one above, or ask your agent to turn your notes into cards.'}
        </p>
      ) : (
        <div className="card-list">
          {shown.map((c) => (
            <CardRow key={c.id} card={c} />
          ))}
          {cards.length > shown.length ? (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sm quiet" onClick={() => setShownCount(shownCount + PAGE * 4)}>
                Show more
              </button>
              <span className="hint">
                {shown.length} of {cards.length}
                {needle ? ' matching' : ''}
              </span>
            </div>
          ) : null}
          {shownCount > PAGE ? (
            <button className="btn sm quiet" onClick={() => setShownCount(PAGE)}>
              Show fewer
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}
