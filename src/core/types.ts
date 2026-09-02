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
  note?: string
  /** When the current note was attached. Lets us measure whether it actually helped. */
  noteAddedAt?: number
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
  tool?: string
  message: string
}

export type Focus = { cardId?: string; topic?: string; reason?: string } | null

export type State = {
  decks: Deck[]
  cards: Card[]
  session: Session
  plan: PlanBlock[]
  activity: Activity[]
  focus: Focus
}
