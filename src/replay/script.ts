import { store } from '../core/store'
import { tools } from '../tools'

export type ReplayStep = {
  /** What the student would have typed, or what is happening. */
  say: string
  /** Whose line this is in the transcript. */
  from: 'student' | 'agent'
  tool?: string
  args?: () => Record<string, unknown>
  pause?: number
}

const currentCardId = () => store.currentCard()?.id ?? ''

export const REPLAY_STEPS: ReplayStep[] = [
  { from: 'student', say: 'What am I actually weakest at in my OS deck?', pause: 2200 },
  { from: 'agent', say: 'Reading your grading history rather than your screen.', tool: 'get_weak_topics', args: () => ({ deck: 'Operating Systems' }), pause: 2600 },
  { from: 'agent', say: 'Deadlock, by lapse count. Starting a six card drill weighted toward it.', tool: 'start_session', args: () => ({ deck: 'Operating Systems', mode: 'weak', limit: 6 }), pause: 2800 },
  { from: 'student', say: 'I don’t get this one.', pause: 2000 },
  { from: 'agent', say: 'Checking which card is on your screen.', tool: 'get_study_state', pause: 2200 },
  { from: 'agent', say: 'Revealing it so we can look at the answer together.', tool: 'reveal_answer', pause: 2600 },
  {
    from: 'agent',
    say: 'Pinning an explanation to this card, so it is here next week too.',
    tool: 'annotate_card',
    args: () => ({
      cardId: currentCardId(),
      note: 'The banker never lends itself into a corner. It simulates the loan first and only grants it if every customer could still be paid off in some order.',
    }),
    pause: 3200,
  },
  { from: 'agent', say: 'Recording that you missed it, so the scheduler brings it back sooner.', tool: 'grade_current_card', args: () => ({ grade: 'again' }), pause: 2400 },
  { from: 'student', say: 'Have your explanations actually helped?', pause: 2200 },
  { from: 'agent', say: 'Comparing your miss rate before each note with your miss rate after it.', tool: 'get_note_impact', args: () => ({ deck: 'Operating Systems' }), pause: 3400 },
  { from: 'agent', say: 'One is holding up. One is not landing, so that explanation needs rewriting.', tool: 'highlight', args: () => ({ topic: 'Deadlock', reason: 'weakest topic' }), pause: 2800 },
  { from: 'student', say: 'Exam is in nine days, 45 minutes a day. Plan it.', pause: 2200 },
  { from: 'agent', say: 'Building a weighted plan and putting it on your dashboard.', tool: 'plan_revision', args: () => ({ deck: 'Operating Systems', minutesPerDay: 45 }), pause: 3000 },
  { from: 'agent', say: 'That was every step, through tools only. Nothing was clicked.', tool: 'end_session', pause: 2600 },
]

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    })
  })

/**
 * Runs the walkthrough through the real tool layer against the real store.
 * Nothing here is mocked: each step calls the same execute() an agent calls.
 */
export async function runReplay(onStep: (index: number) => void, signal: AbortSignal): Promise<void> {
  // The replay gets a seeded, in-memory workspace. The student's real state was
  // flushed and snapshotted by beginReplay(), and is restored in finally even
  // when they press Stop or a tool fails.
  if (!store.beginReplay()) return
  try {
    for (const [i, step] of REPLAY_STEPS.entries()) {
      if (signal.aborted) return
      onStep(i)
      await wait(step.pause ?? 2400, signal)
      if (signal.aborted) return
      if (!step.tool) continue
      const tool = tools.find((t) => t.name === step.tool)
      if (!tool) continue
      try {
        await tool.execute(step.args ? step.args() : {})
      } catch (err) {
        console.error(`[replay] ${step.tool} failed`, err)
      }
    }
  } finally {
    store.endReplay()
  }
}
