# Tandem

**A study board you and your agent share.**

Tandem is a spaced-repetition study app that publishes its own state as [WebMCP](https://github.com/webmachinelearning/webmcp) tools. An agent doesn't scrape the page or click through the interface. It reads the exact card you are looking at, drills the topics your grading history says you are weakest at, and pins explanations onto your cards that are still there next week.

Built for **The WebMCP Challenge** (OpenAI, September 2026).

## Why this is a WebMCP app and not a chatbot with a database

A chat assistant can already explain deadlock to you. What it cannot do is know that *you* have lapsed on the Coffman conditions five times, that the card is on your screen right now with the answer still hidden, and that the note it writes should live on that card forever.

Tandem exposes 18 tools across four groups:

| Group | Tools |
| --- | --- |
| **Read the student's state** | `list_decks` · `get_deck` · `search_cards` · `get_study_state` · `get_weak_topics` |
| **Change the material** | `create_deck` · `add_cards` · `update_card` · `annotate_card` · `delete_card` · `set_exam_date` |
| **Drive the session** | `start_session` · `reveal_answer` · `grade_current_card` · `queue_cards` · `end_session` |
| **Point and plan** | `highlight` · `plan_revision` |

`get_study_state` is the one that makes the rest matter: it is how the agent sees your screen. Say *"I don't get this one"* with no other context and the agent knows which card, which topic, and whether you've already flipped it.

Everything the agent does is also doable by hand, and both paths write through the same store, so the UI never falls out of sync, and the **live activity feed** shows who did what, tagged with the tool that did it.

## The loop it is built around

1. You study. Cards come from a real SM-2 style scheduler, not a fixed list.
2. You miss one. You say so, out loud, in chat.
3. The agent calls `get_study_state`, sees the card, explains it, and calls `annotate_card`. The explanation is now pinned under that answer, forever.
4. It calls `get_weak_topics`, sees deadlock is your worst topic by lapse count, and calls `queue_cards` to pull every deadlock card to the front of the queue you are already in.
5. Before the exam it calls `plan_revision` and a weighted day-by-day plan appears on your dashboard, tickable.

None of those steps involve the agent guessing where a button is.

## Running it

```bash
npm install
npm run dev
```

Then open the app in a browser that speaks WebMCP:

- **ChatGPT's in-app browser**: supported natively, nothing to enable.
- **Chrome**: set `chrome://flags/#enable-webmcp-testing` to *Enabled*, relaunch, reload the page.

The header pill tells you whether the tools registered and on which surface. Without WebMCP the app still works entirely by hand, and the agent half is additive, never load-bearing.

## Testing without an agent

`harness/simulate.mjs` installs a fake WebMCP host with Playwright, then drives the app **through the tools only**, including the failure paths. It also validates every registered schema (snake_case names, non-trivial descriptions, `required` keys that actually exist in `properties`).

```bash
npm i -D playwright && npx playwright install chromium   # once
npm run build
npx vite preview --port 4173 &
npm run simulate
```

## How the WebMCP integration is written

`src/webmcp/adapter.ts` normalises the surface rather than assuming one:

- looks for `document.modelContext` first (the spec's entry point), then `navigator.modelContext`
- uses `registerTool()` per tool where available, falls back to a bulk `provideContext({ tools })`
- registers behind an `AbortController` so unmounting cleanly withdraws the tools
- polls briefly after first paint, because in-app browsers can install `modelContext` after the app boots
- degrades to a no-op when WebMCP is absent, so the app is never broken by its own integration

Tool executors read live state at call time instead of closing over a snapshot, so tools are registered exactly once and never go stale.

## Design notes worth knowing

- **The scheduler is real.** `src/core/srs.ts` is a compact SM-2 variant. `ease` and `lapses` are what make `get_weak_topics` a measurement rather than a guess. An agent reasoning about "what am I bad at" needs a signal with history behind it.
- **Tool descriptions are written for an agent, not for docs.** Each one says when to reach for it, e.g. `annotate_card`: *"explaining once in chat is forgotten, a note on the card is not."*
- **Errors are recoverable.** A bad deck name returns the list of real deck names; a bad topic returns the deck's topics. The agent can fix itself in one turn.
- **Deck arguments accept names, not just ids**, so the agent can pass through what the student actually said.
- **Every tool returns both prose and `structuredContent`**, so an agent gets a readable answer and a parseable one.

## Stack

React 19 · TypeScript · Vite · zero runtime dependencies beyond React. State persists to `localStorage`; there is no backend and nothing leaves the browser.

## Licence

MIT. See [LICENSE](./LICENSE).
