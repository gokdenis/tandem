import type { Activity, Actor, ApprovalRequest, Card, Deck, Focus, Grade, PlanBlock, Session, State } from './types'
import { DAY, difficulty, isDue, noteImpact, schedule } from './srs'
import { seed } from './seed'

// Bumped when the stored shape changes, so a returning visitor is not left on
// an old snapshot that predates fields the app now reads.
const KEY = 'tandem.state.v2'

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`
/**
 * The calendar day a timestamp falls on, in the student's own time zone.
 *
 * toISOString() would answer in UTC, which put an exam set for the 14th on the
 * 13th for a student in Auckland, and made "today" mean tomorrow for a student
 * in Chicago studying after seven in the evening.
 */
export const dateKey = (t: number) => {
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Stored state is untrusted input: it can be from an older build, hand edited,
 * or truncated by a browser that ran out of quota. Anything that does not have
 * the shape the app expects is discarded in favour of a working workspace.
 */
function isUsable(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<State>
  if (!Array.isArray(s.decks) || !Array.isArray(s.cards)) return false
  if (!s.decks.every((d) => d && typeof d.id === 'string' && typeof d.name === 'string')) return false
  return s.cards.every(
    (c) => c && typeof c.id === 'string' && typeof c.front === 'string' && typeof c.back === 'string',
  )
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (!isUsable(parsed)) return seed()
      const state: State = {
        ...parsed,
        plan: Array.isArray(parsed.plan) ? parsed.plan : [],
        activity: Array.isArray(parsed.activity) ? parsed.activity : [],
        requests: Array.isArray(parsed.requests) ? parsed.requests : [],
        focus: parsed.focus ?? null,
        session: parsed.session ?? null,
      }
      // A stored session pointing at a deck that is gone would wedge the UI.
      if (state.session && !state.decks.some((d) => d.id === state.session!.deckId)) state.session = null
      return prune(state)
    }
  } catch {
    /* unreadable storage: fall through to a fresh workspace */
  }
  return seed()
}

/**
 * Drops every reference to a card that no longer exists.
 *
 * A session queue can hold cards from any deck, because queue_cards lets an
 * agent pull related material together. Deleting a deck used to leave those
 * ids behind: the session stayed open, the header still counted six cards, and
 * the screen showed none of them. Anything that removes cards routes through
 * here so that state cannot be reached.
 */
function prune(state: State): State {
  const live = new Set(state.cards.map((c) => c.id))

  let session = state.session
  if (session) {
    const queue = session.queue.filter((id) => live.has(id))
    if (queue.length === 0) session = null
    else if (queue.length !== session.queue.length) {
      session = { ...session, queue, index: Math.min(session.index, queue.length) }
    }
  }

  const focus = state.focus?.cardId && !live.has(state.focus.cardId) ? null : state.focus

  return { ...state, session, focus }
}

type Listener = () => void

class Store {
  private state: State = load()
  private listeners = new Set<Listener>()
  /** While the scripted replay runs, every tool-driven change is logged as 'replay'. */
  private actorOverride: Actor | null = null

  setActorOverride(actor: Actor | null) {
    this.actorOverride = actor
  }

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
    this.log(this.actorOverride ?? actor, message, tool)
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
    if (id === undefined) return null
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
      (s) =>
        prune({
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
    incoming: Array<{ front: string; back: string; topic?: string | undefined; note?: string | undefined }>,
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
      (s) => prune({ ...s, cards: s.cards.filter((c) => c.id !== cardId) }),
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

  /* -------------------------------------------------------------- approvals */

  request(id: string) {
    return this.state.requests.find((r) => r.id === id)
  }

  get pendingRequest(): ApprovalRequest | undefined {
    return this.state.requests.find((r) => r.status === 'pending')
  }

  /**
   * An agent asking is not the same as a student agreeing. This records the
   * question; only resolveRequest, wired to a button, can answer it.
   */
  askApproval(
    action: ApprovalRequest['action'],
    targetId: string,
    summary: string,
    cost: string,
    labels: { allow: string; deny: string },
    tool?: string,
  ): ApprovalRequest {
    const req: ApprovalRequest = {
      id: uid('req'),
      action,
      targetId,
      summary,
      cost,
      allowLabel: labels.allow,
      denyLabel: labels.deny,
      askedAt: Date.now(),
      status: 'pending',
    }
    this.commit(
      (s) => ({ ...s, requests: [req, ...s.requests].slice(0, 20) }),
      'agent',
      `asked for permission: ${summary}`,
      tool,
    )
    return req
  }

  resolveRequest(id: string, allowed: boolean) {
    const req = this.request(id)
    if (!req || req.status !== 'pending') return
    const status = allowed ? 'allowed' : 'denied'
    this.commit(
      (s) => ({ ...s, requests: s.requests.map((r) => (r.id === id ? { ...r, status } : r)) }),
      'human',
      `${allowed ? 'allowed' : 'denied'} the request: ${req.summary}`,
    )
    if (allowed && req.action === 'delete_card') {
      this.deleteCard(req.targetId, 'human')
    }
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
