import type { Activity, Actor, Card, Deck, Focus, Grade, PlanBlock, Session, State } from './types'
import { DAY, difficulty, isDue, noteImpact, schedule } from './srs'
import { seed } from './seed'

// Bumped when the stored shape changes, so a returning visitor is not left on
// an old snapshot that predates fields the app now reads.
const KEY = 'tandem.state.v2'

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`
export const dateKey = (t: number) => new Date(t).toISOString().slice(0, 10)

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as State
      // A stored session pointing at deleted cards would wedge the UI.
      if (parsed.session && !parsed.decks.some((d) => d.id === parsed.session!.deckId)) parsed.session = null
      return { ...parsed, activity: parsed.activity ?? [] }
    }
  } catch {
    /* corrupt storage – fall through to seed */
  }
  return seed()
}

type Listener = () => void

class Store {
  private state: State = load()
  private listeners = new Set<Listener>()

  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getSnapshot = () => this.state

  private set(next: State) {
    this.state = next
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* quota / private mode – the app still works, it just won't persist */
    }
    this.listeners.forEach((l) => l())
  }

  private log(actor: Actor, message: string, tool?: string) {
    const entry: Activity = { id: uid('act'), at: Date.now(), actor, message, tool }
    this.state = { ...this.state, activity: [entry, ...this.state.activity].slice(0, 60) }
  }

  /** Every mutation goes through here so the activity feed can never drift from state. */
  private commit(mutate: (s: State) => State, actor: Actor, message: string, tool?: string) {
    this.log(actor, message, tool)
    this.set(mutate(this.state))
  }

  /* ------------------------------------------------------------------ reads */

  deck = (id: string) => this.state.decks.find((d) => d.id === id)
  card = (id: string) => this.state.cards.find((c) => c.id === id)
  cardsOf = (deckId: string) => this.state.cards.filter((c) => c.deckId === deckId)

  resolveDeck(nameOrId: string): Deck | undefined {
    const q = nameOrId.trim().toLowerCase()
    return (
      this.state.decks.find((d) => d.id === nameOrId) ??
      this.state.decks.find((d) => d.name.toLowerCase() === q) ??
      this.state.decks.find((d) => d.name.toLowerCase().includes(q))
    )
  }

  topicsOf(deckId: string) {
    const map = new Map<string, Card[]>()
    for (const c of this.cardsOf(deckId)) {
      const list = map.get(c.topic) ?? []
      list.push(c)
      map.set(c.topic, list)
    }
    return map
  }

  weakTopics(deckId: string) {
    return [...this.topicsOf(deckId)]
      .map(([topic, cards]) => {
        const seen = cards.filter((c) => c.history.length > 0)
        return {
          topic,
          cards: cards.length,
          practised: seen.length,
          difficulty: Number(
            (cards.reduce((sum, c) => sum + difficulty(c), 0) / Math.max(1, cards.length)).toFixed(2),
          ),
          lapses: cards.reduce((s, c) => s + c.lapses, 0),
        }
      })
      .sort((a, b) => b.difficulty - a.difficulty)
  }

  dueCount = (deckId: string) => this.cardsOf(deckId).filter((c) => isDue(c)).length

  /** Every annotated card in a deck, with a verdict on whether the note helped. */
  annotated(deckId?: string) {
    const cards = deckId ? this.cardsOf(deckId) : this.state.cards
    return cards
      .filter((c) => c.note && c.noteAddedAt)
      .map((c) => ({ card: c, impact: noteImpact(c)! }))
      .sort((a, b) => (a.impact.verdict === 'not landing' ? -1 : 1) - (b.impact.verdict === 'not landing' ? -1 : 1))
  }

  currentCard(): Card | null {
    const s = this.state.session
    if (!s) return null
    const id = s.queue[s.index]
    return this.card(id) ?? null
  }

  /* ----------------------------------------------------------------- writes */

  createDeck(name: string, description: string, actor: Actor, tool?: string): Deck {
    const deck: Deck = { id: uid('deck'), name, description, examAt: null, createdAt: Date.now() }
    this.commit((s) => ({ ...s, decks: [...s.decks, deck] }), actor, `created deck “${name}”`, tool)
    return deck
  }

  renameDeck(deckId: string, name: string, actor: Actor, tool?: string) {
    this.commit(
      (s) => ({ ...s, decks: s.decks.map((d) => (d.id === deckId ? { ...d, name } : d)) }),
      actor,
      `renamed a deck to “${name}”`,
      tool,
    )
  }

  deleteDeck(deckId: string, actor: Actor, tool?: string) {
    const name = this.deck(deckId)?.name ?? 'deck'
    this.commit(
      (s) => ({
        ...s,
        decks: s.decks.filter((d) => d.id !== deckId),
        cards: s.cards.filter((c) => c.deckId !== deckId),
        plan: s.plan.filter((p) => p.deckId !== deckId),
        session: s.session?.deckId === deckId ? null : s.session,
      }),
      actor,
      `deleted deck “${name}”`,
      tool,
    )
  }

  setExam(deckId: string, examAt: number | null, actor: Actor, tool?: string) {
    this.commit(
      (s) => ({ ...s, decks: s.decks.map((d) => (d.id === deckId ? { ...d, examAt } : d)) }),
      actor,
      examAt ? `set the exam date to ${dateKey(examAt)}` : 'cleared the exam date',
      tool,
    )
  }

  addCards(
    deckId: string,
    incoming: Array<{ front: string; back: string; topic?: string; note?: string }>,
    actor: Actor,
    tool?: string,
  ): Card[] {
    const now = Date.now()
    const made: Card[] = incoming.map((c) => ({
      id: uid('card'),
      deckId,
      front: c.front,
      back: c.back,
      topic: c.topic?.trim() || 'General',
      note: c.note,
      ease: 2.5,
      interval: 0,
      reps: 0,
      lapses: 0,
      dueAt: now,
      history: [],
      createdBy: actor,
    }))
    this.commit(
      (s) => ({ ...s, cards: [...s.cards, ...made] }),
      actor,
      `added ${made.length} card${made.length === 1 ? '' : 's'} to “${this.deck(deckId)?.name ?? 'deck'}”`,
      tool,
    )
    return made
  }

  updateCard(cardId: string, patch: Partial<Pick<Card, 'front' | 'back' | 'topic' | 'note'>>, actor: Actor, tool?: string) {
    // Stamping the note lets noteImpact() split this card's history into
    // "before the explanation" and "after it", which is the whole point.
    const stamped = patch.note !== undefined ? { ...patch, noteAddedAt: Date.now() } : patch
    this.commit(
      (s) => ({ ...s, cards: s.cards.map((c) => (c.id === cardId ? { ...c, ...stamped } : c)) }),
      actor,
      patch.note !== undefined ? 'attached an explanation to a card' : 'edited a card',
      tool,
    )
  }

  deleteCard(cardId: string, actor: Actor, tool?: string) {
    this.commit(
      (s) => ({
        ...s,
        cards: s.cards.filter((c) => c.id !== cardId),
        session: s.session ? { ...s.session, queue: s.session.queue.filter((id) => id !== cardId) } : s.session,
      }),
      actor,
      'deleted a card',
      tool,
    )
  }

  /* --------------------------------------------------------------- sessions */

  startSession(deckId: string, queue: string[], label: string, actor: Actor, tool?: string) {
    const session: Session = {
      deckId,
      queue,
      index: 0,
      revealed: false,
      startedAt: Date.now(),
      graded: 0,
      correct: 0,
      label,
    }
    this.commit((s) => ({ ...s, session, focus: null }), actor, `started a session: ${label} (${queue.length} cards)`, tool)
  }

  reveal(actor: Actor, tool?: string) {
    this.commit(
      (s) => (s.session ? { ...s, session: { ...s.session, revealed: true } } : s),
      actor,
      'revealed the answer',
      tool,
    )
  }

  grade(grade: Grade, actor: Actor, tool?: string) {
    const s = this.state
    const session = s.session
    const card = this.currentCard()
    if (!session || !card) return

    const updated = schedule(card, grade)
    const good = grade === 'good' || grade === 'easy'
    // "again" means the card is not learned yet, so put it back near the end.
    const queue = [...session.queue]
    if (grade === 'again') queue.push(card.id)

    this.commit(
      (st) => ({
        ...st,
        cards: st.cards.map((c) => (c.id === card.id ? updated : c)),
        session: {
          ...session,
          queue,
          index: session.index + 1,
          revealed: false,
          graded: session.graded + 1,
          correct: session.correct + (good ? 1 : 0),
        },
      }),
      actor,
      `graded “${card.front.slice(0, 42)}${card.front.length > 42 ? '…' : ''}” as ${grade}`,
      tool,
    )
  }

  endSession(actor: Actor, tool?: string) {
    const s = this.state.session
    const summary = s ? `${s.correct}/${s.graded} correct` : 'no cards'
    this.commit((st) => ({ ...st, session: null }), actor, `ended the session: ${summary}`, tool)
  }

  reorderQueue(ids: string[], actor: Actor, tool?: string) {
    this.commit(
      (s) => (s.session ? { ...s, session: { ...s.session, queue: ids, index: 0, revealed: false } } : s),
      actor,
      `re-ordered the study queue (${ids.length} card${ids.length === 1 ? '' : 's'})`,
      tool,
    )
  }

  /* ------------------------------------------------------------------- plan */

  setPlan(blocks: PlanBlock[], actor: Actor, tool?: string) {
    this.commit((s) => ({ ...s, plan: blocks }), actor, `built a ${blocks.length}-day study plan`, tool)
  }

  togglePlanBlock(id: string, actor: Actor, tool?: string) {
    this.commit(
      (s) => ({ ...s, plan: s.plan.map((p) => (p.id === id ? { ...p, done: !p.done } : p)) }),
      actor,
      'ticked off a study block',
      tool,
    )
  }

  setFocus(focus: Focus, actor: Actor, tool?: string) {
    this.commit(
      (s) => ({ ...s, focus }),
      actor,
      focus ? `highlighted ${focus.topic ? `topic “${focus.topic}”` : 'a card'} in the UI` : 'cleared the highlight',
      tool,
    )
  }

  reset(actor: Actor = 'human') {
    this.state = seed()
    this.commit((s) => s, actor, 'reset the workspace to the demo data')
  }
}

export const store = new Store()
export { DAY, difficulty, isDue, noteImpact }
export type { Grade }
