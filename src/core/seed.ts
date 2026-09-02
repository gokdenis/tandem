import type { Card, Deck, Grade, State } from './types'

const DAY = 86_400_000
let n = 0
const id = (p: string) => `${p}_seed${(n += 1)}`

type Row = [topic: string, front: string, back: string, past: Grade[]]

/**
 * The demo deck ships with grading history on purpose: `get_weak_topics` and
 * `plan_revision` are only interesting against a student who already has a
 * shape to their knowledge, and a first-run empty state hides the best part
 * of the app.
 */
const OS_ROWS: Row[] = [
  ['Scheduling', 'What problem does the Completely Fair Scheduler solve?', 'It approximates ideal multitasking by giving each runnable task a proportional share of CPU time, tracked as virtual runtime.', ['good', 'good']],
  ['Scheduling', 'Round-robin: what happens if the quantum is too small?', 'Context-switch overhead dominates and throughput collapses, even though response time looks good.', ['good']],
  ['Scheduling', 'Define convoy effect.', 'Short jobs queue behind one long CPU-bound job under FCFS, inflating average waiting time.', ['hard', 'good']],
  ['Deadlock', 'Name the four Coffman conditions.', 'Mutual exclusion, hold and wait, no preemption, circular wait. All four must hold simultaneously.', ['again', 'hard', 'again']],
  ['Deadlock', 'How does the Banker’s algorithm avoid deadlock?', 'It only grants a request if the resulting state is safe, meaning some sequence of processes can still finish with the remaining resources.', ['again', 'again']],
  ['Deadlock', 'Difference between deadlock avoidance and prevention?', 'Prevention structurally breaks one Coffman condition; avoidance allows the conditions but refuses allocations that would lead to an unsafe state.', ['again', 'hard']],
  ['Virtual memory', 'What is thrashing?', 'The working set no longer fits in physical memory, so the system spends more time paging than executing.', ['good', 'good', 'easy']],
  ['Virtual memory', 'Why is a TLB miss expensive?', 'The MMU must walk the multi-level page table in memory, which costs several dependent memory accesses before the original access can proceed.', ['hard', 'good']],
  ['Virtual memory', 'Explain copy-on-write for fork().', 'Parent and child share physical pages marked read-only; the first write traps and the kernel copies just that page.', ['good']],
  ['Concurrency', 'What does a semaphore’s P/V pair guarantee?', 'P (wait) blocks while the counter is zero; V (signal) increments and wakes a waiter. Together they bound the number of processes inside a region.', ['hard']],
  ['Concurrency', 'Why is a spinlock wrong for a long critical section?', 'The waiter burns CPU instead of yielding; on a single core it can deadlock against the lock holder entirely.', ['again', 'hard']],
  ['Concurrency', 'What is priority inversion?', 'A high-priority task waits on a lock held by a low-priority task that a medium-priority task keeps preempting. Fixed by priority inheritance.', ['again']],
  ['File systems', 'What is a journal in a filesystem?', 'A write-ahead log of pending metadata (and optionally data) changes, replayed after a crash to reach a consistent state.', ['good', 'easy']],
  ['File systems', 'inode vs directory entry?', 'The inode holds metadata and block pointers; the directory entry maps a name to an inode number. Hard links are two names for one inode.', ['good']],
]

const ALGO_ROWS: Row[] = [
  ['Complexity', 'Why is amortised O(1) not the same as O(1)?', 'Amortised cost averages over a sequence of operations. Any single operation may still be expensive, such as a dynamic array resize at O(n), but the total over n operations is O(n).', ['hard']],
  ['Complexity', 'Master theorem: T(n) = 2T(n/2) + O(n)', 'O(n log n). The work per level is O(n) and there are log n levels.', ['good']],
  ['Sorting', 'When is quicksort worse than mergesort?', 'On adversarial or already-sorted input with a naive pivot it degrades to O(n^2), and it is not stable. Mergesort holds O(n log n) but needs O(n) extra space.', ['again', 'hard']],
  ['Sorting', 'What makes a sort stable, and when does it matter?', 'Equal keys keep their original relative order. It matters when sorting by one key after another to build a composite ordering.', ['good', 'easy']],
  ['Graphs', 'Why does Dijkstra fail on negative edges?', 'It finalises a node the first time it is popped, assuming no later path can be shorter. A negative edge breaks that assumption; use Bellman-Ford instead.', ['again']],
  ['Graphs', 'BFS vs DFS for shortest path on an unweighted graph?', 'BFS. It explores in order of increasing distance, so the first time it reaches a node is via a shortest path. DFS gives no such guarantee.', ['hard']],
]

function build(deckId: string, rows: Row[]): Card[] {
  const now = Date.now()
  return rows.map(([topic, front, back, past], i) => {
    let ease = 2.5
    let lapses = 0
    let reps = 0
    for (const g of past) {
      if (g === 'again') {
        lapses += 1
        reps = 0
        ease = Math.max(1.3, ease - 0.2)
      } else {
        reps += 1
        ease = Math.min(3, ease + (g === 'easy' ? 0.15 : g === 'hard' ? -0.15 : 0))
      }
    }
    const interval = reps === 0 ? 0 : reps === 1 ? 1 : Math.round(3 * ease)
    return {
      id: id('card'),
      deckId,
      topic,
      front,
      back,
      ease,
      interval,
      reps,
      lapses,
      // Stagger due dates so "due today" is a real subset, not everything.
      dueAt: now - (i % 4) * DAY + (reps > 1 ? DAY : 0),
      history: past.map((g, k) => ({ at: now - (past.length - k) * DAY, grade: g, by: 'human' as const })),
      createdBy: 'human' as const,
    }
  })
}

/**
 * Attach an explanation to a card and give it review history from after that
 * point, so get_note_impact has something real to measure on first run: one
 * note that worked and one that plainly did not.
 */
function annotate(cards: Card[], match: string, note: string, after: Grade[]): void {
  const card = cards.find((c) => c.front.startsWith(match))
  if (!card) return
  const now = Date.now()
  const addedAt = now - (after.length + 1) * DAY

  card.note = note
  card.noteAddedAt = addedAt
  // Push the existing reviews behind the note so the split is unambiguous.
  card.history = [
    ...card.history.map((h, i, all) => ({ ...h, at: addedAt - (all.length - i) * DAY })),
    ...after.map((grade, i) => ({ at: addedAt + (i + 1) * DAY, grade, by: 'human' as const })),
  ]
  for (const g of after) {
    if (g === 'again') {
      card.lapses += 1
      card.ease = Math.max(1.3, card.ease - 0.2)
    }
  }
}

export function seed(): State {
  const os: Deck = {
    id: id('deck'),
    name: 'Operating Systems Midterm',
    description: 'Scheduling, deadlock, virtual memory, concurrency, file systems.',
    examAt: Date.now() + 9 * DAY,
    createdAt: Date.now() - 20 * DAY,
  }
  const algo: Deck = {
    id: id('deck'),
    name: 'Algorithms & Complexity',
    description: 'Complexity analysis, sorting and graph traversal.',
    examAt: null,
    createdAt: Date.now() - 6 * DAY,
  }

  const osCards = build(os.id, OS_ROWS)

  annotate(
    osCards,
    'Why is a spinlock wrong',
    'Think of it as the difference between waiting at a door and hammering on it. A spinlock holds the CPU while it waits, so it only pays off when the wait is shorter than a context switch.',
    ['good', 'good', 'easy'],
  )
  annotate(
    osCards,
    'How does the Banker',
    'It is a bank that will not lend if any customer could then be unable to finish. Safe means some completion order still exists.',
    ['again', 'hard'],
  )

  return {
    decks: [os, algo],
    cards: [...osCards, ...build(algo.id, ALGO_ROWS)],
    session: null,
    plan: [],
    activity: [],
    focus: null,
  }
}
