/** 'replay' is the scripted walkthrough, so its actions can never be mistaken for a live agent's. */
export type Actor = 'human' | 'agent' | 'replay'
export type Grade = 'again' | 'hard' | 'good' | 'easy'

export type Card = {
  id: string
  deckId: string
  front: string
  back: string
  /** Sub-topic tag inside the deck. Drives weak-spot analytics. */
  topic: string
  /** An explanation or mnemonic. Usually written by the agent after a miss. */
  note?: string | undefined
  /** When the current note was attached. Lets us measure whether it actually helped. */
  noteAddedAt?: number | undefined
  /* --- spaced repetition state --- */
  ease: number
  interval: number
  reps: number
  lapses: number
  dueAt: number
  history: Array<{ at: number; grade: Grade; by: Actor }>
  createdBy: Actor
}

export type Deck = {
  id: string
  name: string
  description: string
  examAt: number | null
  createdAt: number
}

export type Session = {
  deckId: string
  /** Card ids, in the order they will be shown. */
  queue: string[]
  index: number
  revealed: boolean
  startedAt: number
  graded: number
  correct: number
  /** Where the queue came from, so the UI can explain itself. */
  label: string
} | null

export type PlanBlock = {
  id: string
  /** YYYY-MM-DD */
  date: string
  deckId: string
  topics: string[]
  minutes: number
  done: boolean
}

export type Activity = {
  id: string
  at: number
  actor: Actor
  tool?: string | undefined
  message: string
}

export type Focus = { cardId?: string | undefined; topic?: string | undefined; reason?: string | undefined } | null

/**
 * A destructive action an agent has asked for and the student has not answered
 * yet. The agent cannot resolve one of these: only a click in the interface can.
 */
export type ApprovalRequest = {
  id: string
  action: 'delete_card'
  targetId: string
  /** What the student is being asked, in their terms. */
  summary: string
  /** What is irreversibly lost if they allow it. */
  cost: string
  /** Buttons name the action, not the permission. */
  allowLabel: string
  denyLabel: string
  askedAt: number
  status: 'pending' | 'allowed' | 'denied'
}

export type State = {
  decks: Deck[]
  cards: Card[]
  session: Session
  plan: PlanBlock[]
  activity: Activity[]
  focus: Focus
  requests: ApprovalRequest[]
}
