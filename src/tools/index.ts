import { fail, ok } from '../webmcp/adapter'
import type { ToolDescriptor } from '../webmcp/types'
import { dateKey, store, uid } from '../core/store'
import { difficulty, isDue, noteImpact, DAY } from '../core/srs'
import type { Card, Deck, Grade, PlanBlock } from '../core/types'

/* ------------------------------------------------------------------ helpers */

const AGENT = 'agent' as const

const str = (description: string) => ({ type: 'string', description })
const int = (description: string) => ({ type: 'integer', description })

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object' as const,
  properties,
  required,
  additionalProperties: false,
})

const brief = (c: Card) => ({
  id: c.id,
  topic: c.topic,
  front: c.front,
  back: c.back,
  note: c.note,
  due: dateKey(c.dueAt),
  overdue: isDue(c),
  difficulty: Number(difficulty(c).toFixed(2)),
  lapses: c.lapses,
  reps: c.reps,
})

/** Deck lookup that accepts an id or a (partial) name, so the agent can say what the user said. */
type DeckLookup = { found: true; deck: Deck } | { found: false; error: string }

function needDeck(nameOrId: unknown): DeckLookup {
  const key = String(nameOrId ?? '').trim()
  if (!key) return { found: false, error: 'deck is required.' }
  const deck = store.resolveDeck(key)
  if (!deck) {
    const names = store.getSnapshot().decks.map((d) => d.name)
    return { found: false, error: `No deck matches “${key}”. Available decks: ${names.join(', ') || '(none yet)'}.` }
  }
  return { found: true, deck }
}

const GRADES: Grade[] = ['again', 'hard', 'good', 'easy']

/* -------------------------------------------------------------------- tools */

export const tools: ToolDescriptor[] = [
  /* ---------------------------------------------------------------- reading */
  {
    name: 'list_decks',
    description:
      'List every deck in the workspace with its card count, how many cards are due now, its exam date and its overall difficulty. Call this first when you do not yet know what the student is studying.',
    inputSchema: obj({}),
    execute: () => {
      const s = store.getSnapshot()
      const rows = s.decks.map((d) => {
        const cards = store.cardsOf(d.id)
        return {
          id: d.id,
          name: d.name,
          description: d.description,
          cards: cards.length,
          due: store.dueCount(d.id),
          examDate: d.examAt ? dateKey(d.examAt) : null,
          daysToExam: d.examAt ? Math.ceil((d.examAt - Date.now()) / DAY) : null,
          topics: [...store.topicsOf(d.id).keys()],
        }
      })
      if (rows.length === 0) return ok('The workspace has no decks yet. Use create_deck to start one.', { decks: [] })
      const text = rows
        .map(
          (r) =>
            `• ${r.name}: ${r.cards} cards, ${r.due} due now${r.examDate ? `, exam ${r.examDate} (in ${r.daysToExam}d)` : ''}. Topics: ${r.topics.join(', ')}`,
        )
        .join('\n')
      return ok(text, { decks: rows })
    },
  },

  {
    name: 'get_deck',
    description:
      'Get the full contents of one deck: every card with its front, back, topic, difficulty and next due date. Use this before rewriting cards or building a plan so you are working from what actually exists.',
    inputSchema: obj({ deck: str('Deck name or id.'), topic: str('Optional: only return cards in this topic.') }, ['deck']),
    execute: ({ deck, topic }) => {
      const r = needDeck(deck)
      if (!r.found) return fail(r.error)
      let cards = store.cardsOf(r.deck.id)
      if (topic) cards = cards.filter((c) => c.topic.toLowerCase() === String(topic).toLowerCase())
      const payload = {
        deck: { id: r.deck.id, name: r.deck.name, examDate: r.deck.examAt ? dateKey(r.deck.examAt) : null },
        cards: cards.map(brief),
      }
      const text =
        `${r.deck.name} (${cards.length} cards${topic ? ` in topic “${topic}”` : ''}):\n` +
        cards.map((c) => `[${c.topic}] ${c.front} → ${c.back}${c.note ? ` (note: ${c.note})` : ''}`).join('\n')
      return ok(text, payload)
    },
  },

  {
    name: 'search_cards',
    description:
      'Full-text search across every card in every deck (front, back, topic and notes). Use it to check whether a card already exists before adding a duplicate.',
    inputSchema: obj({ query: str('Text to search for.'), limit: int('Max results, default 20.') }, ['query']),
    execute: ({ query, limit }) => {
      const q = String(query).toLowerCase()
      const max = Math.max(1, Math.min(100, Number(limit) || 20))
      const hits = store
        .getSnapshot()
        .cards.filter((c) =>
          [c.front, c.back, c.topic, c.note ?? ''].some((f) => f.toLowerCase().includes(q)),
        )
        .slice(0, max)
      if (hits.length === 0) return ok(`No cards match “${query}”.`, { matches: [] })
      return ok(
        hits.map((c) => `[${store.deck(c.deckId)?.name} / ${c.topic}] ${c.front} → ${c.back}`).join('\n'),
        { matches: hits.map(brief) },
      )
    },
  },

  {
    name: 'get_study_state',
    description:
      'Read what the student is looking at right now: the active session, the card on screen, whether the answer is revealed, how the session is going so far, and today’s plan blocks. Call this whenever the student says something like “I don’t get this one” without naming the card. It is how you see their screen.',
    inputSchema: obj({}),
    execute: () => {
      const s = store.getSnapshot()
      const card = store.currentCard()
      if (!s.session) {
        return ok('No study session is running. The student is on the dashboard.', {
          session: null,
          plan: s.plan.filter((p) => p.date === dateKey(Date.now())),
        })
      }
      const deck = store.deck(s.session.deckId)
      const payload = {
        session: {
          deck: deck?.name,
          label: s.session.label,
          position: s.session.index + 1,
          total: s.session.queue.length,
          graded: s.session.graded,
          correct: s.session.correct,
          revealed: s.session.revealed,
        },
        currentCard: card ? brief(card) : null,
        plan: s.plan.filter((p) => p.date === dateKey(Date.now())),
      }
      const text = card
        ? `Studying “${deck?.name}” (${s.session.label}), card ${s.session.index + 1} of ${s.session.queue.length}. ` +
          `On screen: [${card.topic}] "${card.front}". Answer ${s.session.revealed ? `revealed: "${card.back}"` : 'still hidden'}. ` +
          `So far ${s.session.correct}/${s.session.graded} correct.`
        : `The session queue is finished (${s.session.correct}/${s.session.graded} correct). Call end_session or queue_cards to continue.`
      return ok(text, payload)
    },
  },

  {
    name: 'get_weak_topics',
    description:
      'Rank the topics in a deck from weakest to strongest, using the student’s real grading history (lapse count and ease decay), not guesses. This is the right input for deciding what to drill or what to put in a revision plan.',
    inputSchema: obj({ deck: str('Deck name or id.') }, ['deck']),
    execute: ({ deck }) => {
      const r = needDeck(deck)
      if (!r.found) return fail(r.error)
      const rows = store.weakTopics(r.deck.id)
      const text = rows
        .map(
          (t) =>
            `${t.topic}: difficulty ${t.difficulty} (${t.lapses} lapse${t.lapses === 1 ? '' : 's'} across ${t.cards} cards, ${t.practised} practised)`,
        )
        .join('\n')
      return ok(`Weakest first for ${r.deck.name}:\n${text}`, { deck: r.deck.name, topics: rows })
    },
  },

  /* ---------------------------------------------------------------- writing */
  {
    name: 'create_deck',
    description:
      'Create a new empty deck, then fill it with add_cards. Use this when the student mentions a subject that is not already in list_decks, rather than dropping unrelated cards into an existing deck.',
    inputSchema: obj({ name: str('Deck name.'), description: str('One line about what it covers.') }, ['name']),
    execute: ({ name, description }) => {
      const deck = store.createDeck(String(name), String(description ?? ''), AGENT, 'create_deck')
      return ok(`Created deck “${deck.name}”.`, { deckId: deck.id })
    },
  },

  {
    name: 'add_cards',
    description:
      'Add one or many flashcards to a deck in a single call. This is how you turn a paste of lecture notes into study material: split the notes yourself, then send the cards here with a topic tag on each. Keep fronts to a single question and backs to a single idea.',
    inputSchema: obj(
      {
        deck: str('Deck name or id.'),
        cards: {
          type: 'array',
          description: 'The cards to add.',
          items: obj(
            {
              front: str('The question or prompt.'),
              back: str('The answer.'),
              topic: str('Short topic tag, e.g. "Deadlock". Group related cards under the same tag.'),
              note: str('Optional explanation or mnemonic shown under the answer.'),
            },
            ['front', 'back'],
          ),
        },
      },
      ['deck', 'cards'],
    ),
    execute: ({ deck, cards }) => {
      const r = needDeck(deck)
      if (!r.found) return fail(r.error)
      const list = Array.isArray(cards) ? (cards as Array<Record<string, string>>) : []
      const clean = list
        .filter((c) => c && String(c.front ?? '').trim() && String(c.back ?? '').trim())
        .map((c) => ({ front: String(c.front), back: String(c.back), topic: c.topic, note: c.note }))
      if (clean.length === 0) return fail('No usable cards. Each card needs a non-empty front and back.')
      const made = store.addCards(r.deck.id, clean, AGENT, 'add_cards')
      return ok(`Added ${made.length} card${made.length === 1 ? '' : 's'} to “${r.deck.name}”. They are due immediately.`, {
        added: made.map((c) => ({ id: c.id, topic: c.topic, front: c.front })),
      })
    },
  },

  {
    name: 'update_card',
    description: 'Rewrite an existing card’s question, answer or topic tag. Use search_cards or get_deck to find the id first.',
    inputSchema: obj(
      { cardId: str('Card id.'), front: str('New question.'), back: str('New answer.'), topic: str('New topic tag.') },
      ['cardId'],
    ),
    execute: ({ cardId, front, back, topic }) => {
      const card = store.card(String(cardId))
      if (!card) return fail(`No card with id ${cardId}.`)
      const patch: Record<string, string> = {}
      if (front) patch.front = String(front)
      if (back) patch.back = String(back)
      if (topic) patch.topic = String(topic)
      if (Object.keys(patch).length === 0) return fail('Nothing to update. Pass front, back or topic.')
      store.updateCard(card.id, patch, AGENT, 'update_card')
      return ok(`Updated card ${card.id}.`, { card: brief({ ...card, ...patch } as Card) })
    },
  },

  {
    name: 'annotate_card',
    description:
      'Attach an explanation, worked example or mnemonic to a card. The note appears under the answer whenever the student sees that card again, including in future sessions. Use this the moment the student gets something wrong: explaining once in chat is forgotten, a note on the card is not.',
    inputSchema: obj({ cardId: str('Card id.'), note: str('The explanation or mnemonic. Keep it to two or three sentences.') }, [
      'cardId',
      'note',
    ]),
    execute: ({ cardId, note }) => {
      const card = store.card(String(cardId))
      if (!card) return fail(`No card with id ${cardId}.`)
      store.updateCard(card.id, { note: String(note) }, AGENT, 'annotate_card')
      return ok(`Saved your explanation onto “${card.front}”. The student will see it every time this card comes up.`)
    },
  },

  {
    name: 'delete_card',
    description:
      'Ask the student for permission to permanently remove a card, for example a duplicate or one they say is wrong. This does not delete anything by itself. It puts the request on the student’s screen, where they press Allow or Deny; a deletion can only happen because they clicked, never because you asserted they agreed. Explain in chat why you are asking, then poll get_approval for the answer.',
    inputSchema: obj({ cardId: str('Card id.'), reason: str('Why this card should go. Shown to the student.') }, ['cardId']),
    execute: ({ cardId, reason }) => {
      const card = store.card(String(cardId))
      if (!card) return fail(`No card with id ${cardId}.`)
      if (store.pendingRequest) return fail('The student already has an unanswered request on screen. Wait for that one.')
      const req = store.askApproval(
        'delete_card',
        card.id,
        `Delete "${card.front}"${reason ? ` (${String(reason)})` : ''}`,
        `${card.history.length} recorded review${card.history.length === 1 ? '' : 's'} and its scheduling state`,
        'delete_card',
      )
      return ok(
        `Asked the student on screen. Nothing has been deleted. Tell them why you are asking, then call get_approval with requestId "${req.id}".`,
        { requestId: req.id, status: 'pending' },
      )
    },
  },

  {
    name: 'get_approval',
    description:
      'Check what the student answered to a permission request. Returns pending until they press a button. Never assume the answer: a pending request means the card is still there.',
    inputSchema: obj({ requestId: str('The id returned by the tool that asked.') }, ['requestId']),
    execute: ({ requestId }) => {
      const req = store.request(String(requestId))
      if (!req) return fail(`No request with id ${requestId}.`)
      const text =
        req.status === 'pending'
          ? `Still waiting. The student has not answered "${req.summary}" yet.`
          : req.status === 'allowed'
            ? `The student allowed it, and it has been carried out.`
            : `The student denied it. Nothing was changed. Do not ask again unless they bring it up.`
      return ok(text, { status: req.status, summary: req.summary })
    },
  },

  {
    name: 'set_exam_date',
    description:
      'Set or clear the exam date on a deck. plan_revision needs this to know how many days it has to work with, and the dashboard counts down to it.',
    inputSchema: obj({ deck: str('Deck name or id.'), date: str('Exam date as YYYY-MM-DD, or "none" to clear it.') }, [
      'deck',
      'date',
    ]),
    execute: ({ deck, date }) => {
      const r = needDeck(deck)
      if (!r.found) return fail(r.error)
      const raw = String(date).trim().toLowerCase()
      if (raw === 'none' || raw === 'null') {
        store.setExam(r.deck.id, null, AGENT, 'set_exam_date')
        return ok(`Cleared the exam date on “${r.deck.name}”.`)
      }
      const t = Date.parse(`${raw}T09:00:00`)
      if (Number.isNaN(t)) return fail(`Could not read “${date}” as a date. Use YYYY-MM-DD.`)
      store.setExam(r.deck.id, t, AGENT, 'set_exam_date')
      const days = Math.ceil((t - Date.now()) / DAY)
      return ok(`Exam for “${r.deck.name}” set to ${dateKey(t)}, ${days} day${days === 1 ? '' : 's'} away.`)
    },
  },

  /* --------------------------------------------------------------- sessions */
  {
    name: 'start_session',
    description:
      'Put the student into a study session. Mode "due" studies what spaced repetition says is due, "weak" drills the lowest-scoring topics first, "topic" studies one named topic, "all" shuffles everything. The cards appear on the student’s screen immediately, and they answer in the UI, not in chat.',
    inputSchema: obj(
      {
        deck: str('Deck name or id.'),
        mode: { type: 'string', enum: ['due', 'weak', 'topic', 'all'], description: 'How to build the queue.' },
        topic: str('Required when mode is "topic".'),
        limit: int('Max cards in the queue. Default 12.'),
      },
      ['deck', 'mode'],
    ),
    execute: ({ deck, mode, topic, limit }) => {
      const r = needDeck(deck)
      if (!r.found) return fail(r.error)
      const max = Math.max(1, Math.min(100, Number(limit) || 12))
      let cards = store.cardsOf(r.deck.id)
      let label = ''

      if (mode === 'due') {
        cards = cards.filter((c) => isDue(c)).sort((a, b) => a.dueAt - b.dueAt)
        label = 'due today'
      } else if (mode === 'weak') {
        cards = [...cards].sort((a, b) => difficulty(b) - difficulty(a))
        label = 'weakest first'
      } else if (mode === 'topic') {
        const t = String(topic ?? '').trim()
        if (!t) return fail('mode "topic" needs a topic.')
        cards = cards.filter((c) => c.topic.toLowerCase() === t.toLowerCase())
        if (cards.length === 0)
          return fail(`No cards in topic “${t}”. Topics in this deck: ${[...store.topicsOf(r.deck.id).keys()].join(', ')}.`)
        label = `topic: ${cards[0].topic}`
      } else {
        cards = [...cards].sort(() => Math.random() - 0.5)
        label = 'full deck, shuffled'
      }

      const queue = cards.slice(0, max)
      if (queue.length === 0) return fail('Nothing to study with that filter. Try mode "all" or "weak".')
      store.startSession(r.deck.id, queue.map((c) => c.id), label, AGENT, 'start_session')
      return ok(
        `Started a ${queue.length}-card session on “${r.deck.name}” (${label}). The first card is on screen now: "${queue[0].front}".`,
        { queued: queue.length, first: brief(queue[0]) },
      )
    },
  },

  {
    name: 'reveal_answer',
    description:
      'Flip the card the student is currently looking at. Use it when they have committed to an answer and want to check, or when you are walking them through one.',
    inputSchema: obj({}),
    execute: () => {
      const card = store.currentCard()
      if (!card) return fail('No card is on screen. Start a session first.')
      store.reveal(AGENT, 'reveal_answer')
      const impact = noteImpact(card)
      return ok(
        `Revealed: ${card.back}${card.note ? `\nNote on this card: ${card.note}` : ''}` +
          (impact ? `\nSince that note was added the student has missed this ${impact.afterMisses} of ${impact.afterReviews} times (${impact.verdict}).` : ''),
        { card: brief(card), noteImpact: impact },
      )
    },
  },

  {
    name: 'grade_current_card',
    description:
      'Record how well the student did on the card on screen and advance to the next one. "again" reschedules it inside this session and lowers its ease; "easy" pushes it far into the future. Only grade when the student has actually told you how it went.',
    inputSchema: obj(
      { grade: { type: 'string', enum: GRADES, description: 'again = missed it, hard = struggled, good = recalled it, easy = instant.' } },
      ['grade'],
    ),
    execute: ({ grade }) => {
      const g = String(grade) as Grade
      if (!GRADES.includes(g)) return fail(`grade must be one of ${GRADES.join(', ')}.`)
      const card = store.currentCard()
      if (!card) return fail('No card is on screen. Start a session first.')
      store.grade(g, AGENT, 'grade_current_card')
      const next = store.currentCard()
      return ok(
        next
          ? `Graded “${card.front}” as ${g}. Next up: "${next.front}" [${next.topic}].`
          : `Graded “${card.front}” as ${g}. That was the last card in the queue.`,
        { next: next ? brief(next) : null },
      )
    },
  },

  {
    name: 'queue_cards',
    description:
      'Replace the current session queue with a specific list of cards, in the order you give. Use it to pivot mid-session. For example, after the student misses two deadlock cards, pull every deadlock card to the front and restart from there.',
    inputSchema: obj(
      { cardIds: { type: 'array', items: { type: 'string' }, description: 'Card ids in the order they should be studied.' } },
      ['cardIds'],
    ),
    execute: ({ cardIds }) => {
      const s = store.getSnapshot()
      if (!s.session) return fail('No session is running. Use start_session first.')
      const ids = (Array.isArray(cardIds) ? cardIds : []).map(String).filter((id) => store.card(id))
      if (ids.length === 0) return fail('None of those card ids exist.')
      store.reorderQueue(ids, AGENT, 'queue_cards')
      const first = store.currentCard()
      return ok(`Queue replaced with ${ids.length} card${ids.length === 1 ? '' : 's'}. Now showing: "${first?.front}".`, { queued: ids.length })
    },
  },

  {
    name: 'end_session',
    description: 'Close the study session and return the student to the dashboard, with a summary of how it went.',
    inputSchema: obj({}),
    execute: () => {
      const s = store.getSnapshot()
      if (!s.session) return fail('No session is running.')
      const { correct, graded } = s.session
      store.endSession(AGENT, 'end_session')
      const pct = graded ? Math.round((correct / graded) * 100) : 0
      return ok(`Session ended: ${correct}/${graded} correct (${pct}%).`, { correct, graded, percent: pct })
    },
  },

  /* ------------------------------------------------------------- attention */
  {
    name: 'highlight',
    description:
      'Point at something on the student’s screen: a topic or a single card gets outlined in the UI with your reason next to it. Use it when you want them to look at something while you explain it in chat.',
    inputSchema: obj(
      { topic: str('Topic to highlight.'), cardId: str('Card to highlight.'), reason: str('Short label shown next to the highlight.') },
      [],
    ),
    execute: ({ topic, cardId, reason }) => {
      if (!topic && !cardId) {
        store.setFocus(null, AGENT, 'highlight')
        return ok('Cleared the highlight.')
      }
      if (cardId && !store.card(String(cardId))) return fail(`No card with id ${cardId}.`)
      store.setFocus(
        { topic: topic ? String(topic) : undefined, cardId: cardId ? String(cardId) : undefined, reason: reason ? String(reason) : undefined },
        AGENT,
        'highlight',
      )
      return ok(`Highlighted ${topic ? `topic “${topic}”` : 'that card'} on the student’s screen.`)
    },
  },

  {
    name: 'get_note_impact',
    description:
      'Check whether the explanations you attached to cards actually worked. For every annotated card it compares the student’s miss rate before the note was added with the miss rate after it, and returns a verdict. Use it to find your own explanations that are not landing and rewrite them with annotate_card, rather than assuming an explanation stuck because you wrote it well.',
    inputSchema: obj({ deck: str('Optional: only look at one deck.') }, []),
    execute: ({ deck }) => {
      let deckId: string | undefined
      if (deck) {
        const r = needDeck(deck)
        if (!r.found) return fail(r.error)
        deckId = r.deck.id
      }
      const rows = store.annotated(deckId)
      if (rows.length === 0)
        return ok('No cards have explanations attached yet. Use annotate_card the next time the student misses one.', {
          annotated: [],
        })

      const payload = rows.map(({ card, impact }) => ({
        cardId: card.id,
        topic: card.topic,
        front: card.front,
        note: card.note,
        verdict: impact.verdict,
        beforeMisses: `${impact.beforeMisses}/${impact.beforeReviews}`,
        afterMisses: `${impact.afterMisses}/${impact.afterReviews}`,
        missRateChange: impact.delta,
      }))

      const text = payload
        .map(
          (r) =>
            `[${r.verdict}] "${r.front}": missed ${r.beforeMisses} before the note, ${r.afterMisses} after.` +
            (r.verdict === 'not landing' ? ' Consider rewriting this explanation.' : ''),
        )
        .join('\n')

      const failing = payload.filter((r) => r.verdict === 'not landing').length
      return ok(
        `${payload.length} annotated card${payload.length === 1 ? '' : 's'}${failing ? `, ${failing} not landing` : ', all holding up'}:\n${text}`,
        { annotated: payload },
      )
    },
  },

  /* ---------------------------------------------------------------- planning */
  {
    name: 'plan_revision',
    description:
      'Build a day-by-day revision plan from today to the deck’s exam date, weighted so weak topics get more minutes and every topic gets a spaced second pass. The plan appears on the dashboard as tickable blocks. Requires an exam date, so set one with set_exam_date first.',
    inputSchema: obj(
      { deck: str('Deck name or id.'), minutesPerDay: int('How long the student can study each day. Default 40.') },
      ['deck'],
    ),
    execute: ({ deck, minutesPerDay }) => {
      const r = needDeck(deck)
      if (!r.found) return fail(r.error)
      if (!r.deck.examAt) return fail(`“${r.deck.name}” has no exam date. Call set_exam_date first.`)

      const minutes = Math.max(10, Math.min(240, Number(minutesPerDay) || 40))
      const days = Math.max(1, Math.min(30, Math.ceil((r.deck.examAt - Date.now()) / DAY)))
      const weak = store.weakTopics(r.deck.id)
      if (weak.length === 0) return fail('That deck has no cards yet.')

      // Weight each topic by difficulty, then deal topics across days so that the
      // hardest ones recur most often and nothing goes untouched.
      const slots: string[] = []
      for (const t of weak) {
        const share = Math.max(1, Math.round(t.difficulty * 4) + 1)
        for (let i = 0; i < share; i++) slots.push(t.topic)
      }

      const blocks: PlanBlock[] = []
      let cursor = 0
      for (let d = 0; d < days; d++) {
        const perDay = d === days - 1 ? weak.length : Math.min(2, weak.length)
        const topics: string[] = []
        while (topics.length < perDay && slots.length) {
          const t = slots[cursor % slots.length]
          cursor++
          if (!topics.includes(t)) topics.push(t)
          if (cursor > slots.length * 3) break
        }
        blocks.push({
          id: uid('plan'),
          date: dateKey(Date.now() + d * DAY),
          deckId: r.deck.id,
          topics: topics.length ? topics : [weak[0].topic],
          minutes: d === days - 1 ? Math.round(minutes * 1.5) : minutes,
          done: false,
        })
      }

      store.setPlan(blocks, AGENT, 'plan_revision')
      const text = blocks.map((b) => `${b.date} · ${b.minutes} min · ${b.topics.join(' + ')}`).join('\n')
      return ok(
        `Planned ${days} days to the exam for “${r.deck.name}”, weighted toward ${weak[0].topic}. The last day is a full sweep.\n${text}`,
        { blocks },
      )
    },
  },
]

const READ_ONLY = new Set([
  'list_decks',
  'get_deck',
  'search_cards',
  'get_study_state',
  'get_weak_topics',
  'get_note_impact',
  'get_approval',
])
// delete_card only ever asks. The deletion itself is carried out by the
// student's click, so the hint marks the intent rather than the effect.
const DESTRUCTIVE = new Set(['delete_card'])

// Declared once over the finished list so a new tool cannot quietly ship
// without a stance on whether it reads, writes or destroys.
for (const tool of tools) {
  tool.annotations = {
    readOnlyHint: READ_ONLY.has(tool.name),
    destructiveHint: DESTRUCTIVE.has(tool.name),
    idempotentHint: READ_ONLY.has(tool.name) || tool.name === 'highlight' || tool.name === 'set_exam_date',
  }
}

export const toolNames = tools.map((t) => t.name)

/** How the surface is organised, for anyone reading it rather than calling it. */
export const TOOL_GROUPS: Array<{ label: string; names: string[] }> = [
  {
    label: 'Read the student’s state',
    names: ['list_decks', 'get_deck', 'search_cards', 'get_study_state', 'get_weak_topics', 'get_note_impact'],
  },
  {
    label: 'Change the material',
    names: ['create_deck', 'add_cards', 'update_card', 'annotate_card', 'delete_card', 'get_approval', 'set_exam_date'],
  },
  {
    label: 'Drive the session',
    names: ['start_session', 'reveal_answer', 'grade_current_card', 'queue_cards', 'end_session'],
  },
  { label: 'Point and plan', names: ['highlight', 'plan_revision'] },
]

/**
 * Tools that only mean anything while a card is on screen. Registering these
 * when no session is running would offer an agent controls it cannot use.
 */
export const SESSION_ONLY = ['reveal_answer', 'grade_current_card', 'queue_cards', 'end_session']

/** Tools that only mean anything when no session is running. */
export const IDLE_ONLY = ['start_session']

/** The tool surface for a given application state. */
export function activeTools(hasSession: boolean): ToolDescriptor[] {
  return tools.filter((t) => {
    if (SESSION_ONLY.includes(t.name)) return hasSession
    if (IDLE_ONLY.includes(t.name)) return !hasSession
    return true
  })
}
