# Tandem

**A study board you and your agent share.**

Tandem is a spaced-repetition study app that publishes its own state as [WebMCP](https://github.com/webmachinelearning/webmcp) tools. An agent doesn't scrape the page or click through the interface. It reads the exact card you are looking at, drills the topics your grading history says you are weakest at, and pins explanations onto your cards that are still there next week.

Built for **The WebMCP Challenge** (OpenAI, September 2026).

[![CI](https://github.com/gokdenis/tandem/actions/workflows/ci.yml/badge.svg)](https://github.com/gokdenis/tandem/actions/workflows/ci.yml)

**[Open the live app](https://tandem-tau-nine.vercel.app/)**

## Why this is a WebMCP app and not a chatbot with a database

A chat assistant can already explain deadlock to you. What it cannot do is know that *you* have lapsed on the Coffman conditions five times, that the card is on your screen right now with the answer still hidden, and that the note it writes should live on that card forever.

Tandem exposes 20 tools across four groups:

| Group | Tools |
| --- | --- |
| **Read the student's state** | `list_decks` · `get_deck` · `search_cards` · `get_study_state` · `get_weak_topics` · `get_note_impact` |
| **Change the material** | `create_deck` · `add_cards` · `update_card` · `annotate_card` · `delete_card` · `get_approval` · `set_exam_date` |
| **Drive the session** | `start_session` · `reveal_answer` · `grade_current_card` · `queue_cards` · `end_session` |
| **Point and plan** | `highlight` · `plan_revision` |

`get_study_state` is the one that makes the rest matter: it is how the agent sees your screen. Say *"I don't get this one"* with no other context and the agent knows which card, which topic, and whether you've already flipped it.

The core study and material actions remain available by hand: you can create decks, write and edit cards, paste a block of notes, set the exam date and grade yourself in the interface. Agent-native coordination actions such as reordering a mixed queue, highlighting an explanation and generating a weighted plan stay visible and reviewable on the same board. Both paths write through one store, so the UI never falls out of sync, and the **live activity feed** shows who did what, tagged with the tool that did it.

## How it fits together

```mermaid
flowchart LR
    A["Agent<br/>(ChatGPT in-app browser,<br/>Chrome with WebMCP)"]
    B["document.modelContext"]
    C["ToolRegistry<br/>syncs the surface to app state"]
    D["20 tool executors<br/>read live state at call time"]
    E["Store<br/>SM-2 scheduler + activity log"]
    F["Interface<br/>core actions stay available by hand"]
    G["Student"]
    H["Approval prompt"]

    A <--> B
    B <--> C
    C --> D
    D <--> E
    E <--> F
    F <--> G
    D -. "asks for destructive changes" .-> H
    H --> G
    G -- "only a click resolves it" --> E
```

Both halves write through one store, so the interface can never drift from what an agent believes is true, and the activity feed can label every change with who made it.

## The tool surface is not fixed

Most WebMCP pages register one list at startup and leave it there. Tandem registers the tools that make sense for what the app is currently doing.

`grade_current_card` means nothing when no card is on screen, and `start_session` means nothing while a session is already running. So the study controls are registered when a session starts and withdrawn when it ends: **16 tools while you are on the dashboard, 19 while you are studying.** The header count is read back from `document.modelContext.getTools()`, not from our own array, so what you see is what the browser actually holds.

The registry diffs the requested set against what is live and only touches the difference, so a stable tool is never re-registered and cannot end up duplicated on a browser that treats an aborted signal as a no-op.

## Does the agent's help actually work?

When an agent explains a card, `annotate_card` stamps the moment the note was attached. That timestamp splits the card's review history in two, so the same data that drives scheduling also answers a question no chat transcript can: **did that explanation change anything?**

`get_note_impact` returns the verdict per card, comparing miss rate before the note against miss rate after it. An agent can find its own explanations that are not landing and rewrite them, instead of assuming an explanation stuck because it was well written. The card shows the same verdict to you while you study.

This is the argument for writing into a user's durable state rather than into a conversation, made measurable.

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

### No WebMCP browser to hand?

Click **Watch a replay** on the dashboard. It runs a scripted walkthrough through the real tool layer against a temporary in-memory copy of the sample workspace: the same `execute()` an agent calls, in the same order. Nothing about the tool path is mocked, and a labelled bar makes clear throughout that the calls are scripted and no agent is connected. Stopping or completing the replay restores your previous workspace exactly. It takes about forty seconds.

## Tests

```bash
npm test      # 52 tests: scheduler, note impact, tool surface, dates, edges, invariants, evals
npm run check # lint, typecheck, tests and a production build
npm run a11y  # axe-core over both themes, on three application states
```

The browser harnesses need Chromium once per machine: `npx playwright install chromium`. Both `npm run simulate` and `npm run a11y` start and stop their own local Vite server unless `URL` points at a deployment.

The tool-layer tests assert the things a description can only promise: that failures come back with the real deck and topic names, that session controls are withdrawn when no card is on screen, that every tool declares the current WebMCP safety annotations, and that a delete request leaves the card in place until a human answers it.

`invariants.test.ts` runs thirty seeded random sequences of eighteen different operations and checks after every one of them that the workspace still holds together: no duplicate or orphaned cards, ease inside its bounds, a session index that cannot pass the end of its queue, at most one pending permission request, and state that survives a round trip through storage unchanged. `edges.test.ts` is one regression test per defect this found.

### What that turned up

TypeScript was not running in strict mode, which is how most of these survived. Turning it on, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, produced 66 errors and these four real defects:

- **Dates were computed in UTC.** An exam set for the 14th displayed as the 13th in Auckland, and after seven in the evening in Chicago the plan called tomorrow "today". `dateKey` now reads local calendar components.
- **Deleting a deck left ghosts in a running session.** `queue_cards` can pull cards from any deck, so a queue could outlive the deck it borrowed from: the session stayed open, the counter still read six cards, and the screen showed none. Every path that removes cards now goes through one pruning step.
- **A past exam date was accepted.** `set_exam_date` reported "-2436 days away" and `plan_revision` built a plan around it. Both now refuse and say what today is, so the agent can correct the year.
- **Stored state was trusted.** Anything that parsed as JSON was loaded, so a truncated or hand edited entry could take the app down. It is now shape checked and discarded if it does not match.

Time was also being read during render, which froze every relative timestamp until an unrelated change and left a tab open past midnight still calling yesterday today.

### What measuring turned up

A deck of two thousand cards, driven through the tools:

| | Before | After |
| --- | --- | --- |
| Expanding the card list | 1564 ms | 116 ms per page |
| `get_deck` response | 120 KB of text | bounded 12-card page with continuation metadata |
| Starting a session | 211 ms | 22 ms |
| Grading one card | 175 ms | 32 ms |
| DOM nodes | 16,377 | 267 |

The list now pages and filters instead of rendering every row. `get_deck` returns twelve cards by default and tells the agent how many it left out and how to continue or narrow, rather than spending its context. Persistence is coalesced and flushed on `pagehide` and `visibilitychange`, because serialising the workspace on every keystroke was most of the per-action cost.

Four more defects came out of the same pass:

- **Two overlapping registry syncs registered every tool twice.** Registration is asynchronous, so both saw an empty registry. Syncs are serialised now, with the latest requested surface winning, and a host with realistic latency driven through thirty rapid session cycles produces no duplicates.
- **`add_cards` silently dropped everything past its limit** and reported success. It now says how many it did not add and asks for another call.
- **A tool that threw handed the browser an exception** rather than an answer. Every executor is wrapped so an unexpected failure comes back in the shape an agent can act on.
- **Two tabs overwrote each other in silence.** The tab that did not write now says so and offers to load the newer workspace.

Text going into storage is bounded, and a browser that refuses to save says so instead of pretending everything is fine.

The final release pass closed the cross-feature cases as well:

- **The replay replaced the visitor's workspace.** It now runs against a temporary in-memory sample and restores the exact prior state on completion, cancellation or failure.
- **A mixed-deck queue reported the deck it started from instead of the card on screen.** Session state and the study view now identify the current card's deck, retain the starting deck for context and label mixed queues explicitly.
- **Planning one deck erased every other plan, and the last-day sweep could stop early.** Plans are replaced per deck, while the final block is guaranteed to include every topic.
- **Tool inputs trusted browser-side schema validation too much.** Impossible calendar dates, blank updates, unknown modes, out-of-range offsets and oversized stored text are now rejected or bounded inside the executors and store as well.

## Testing without an agent

`harness/simulate.mjs` installs a fake WebMCP host with Playwright, then drives the app **through the tools only**, including the failure paths. It also validates every registered schema (snake_case names, non-trivial descriptions, valid `required` keys and both current safety annotations).

```bash
npm install
npx playwright install chromium # once per machine
npm run simulate                 # starts and stops its own local server
npm run a11y
```

## How the WebMCP integration is written

`src/webmcp/adapter.ts` normalises the surface rather than assuming one:

- looks for `document.modelContext` first (the spec's entry point), then `navigator.modelContext`
- uses `registerTool()` per tool where available, falls back to a bulk `provideContext({ tools })`
- keeps one `AbortController` per tool so individual tools can be withdrawn without disturbing the rest
- re-syncs the surface whenever application state changes, and listens for the spec's `toolchange` event
- polls briefly after first paint, because in-app browsers can install `modelContext` after the app boots
- degrades to a no-op when WebMCP is absent, so the app is never broken by its own integration

Tool executors read live state at call time instead of closing over a snapshot, so tools are registered exactly once and never go stale.

### Audited against the WebMCP safety model

The surface was reviewed against the current WebMCP tool shape and general tool-design guidance.

- **Pagination metadata.** `search_cards` and `get_deck` now return `total`, `count`, `offset`, `hasMore` and `nextOffset`, and say in prose how to fetch the next page. An offset past the end is an error that names the real total rather than an empty result an agent might read as "nothing there".
- **Current safety annotations.** Every tool declares `readOnlyHint` and `untrustedContentHint`. Student-authored deck, card and note text is explicitly marked as untrusted output rather than being passed to an agent as application-authored instructions.
- **Annotations that cannot cost a tool.** Current WebMCP hosts accept those safety annotations. Registration retries once without them for older pre-annotation experimental hosts, preserving the core tool surface without advertising unsupported MCP-server hints.
- **Failures stay inside the tool.** An executor that throws would otherwise hand the browser an exception and leave the agent nothing to act on.

**No service prefix, deliberately.** The guidance asks for `service_action_resource` naming because stdio MCP servers land in one flat list where `send_message` could belong to anyone. WebMCP is not that: the browser knows which origin registered which tool, and the spec's `RegisteredTool` carries `origin` and `window`. Prefixing every name with `tandem_` would add tokens to every call to solve a collision the platform already handles.

### An evaluation set for the tools

[`evals/tool-surface.xml`](./evals/tool-surface.xml) holds ten questions in the format the MCP guidance describes: independent, read only, each needing more than one call, each with one answer that survives string comparison. "Which topic has the highest lapse count", "exactly one attached explanation has not reduced the miss rate, which topic is that card in", "how many cards are due across every deck".

They are not decoration. `src/tools/__tests__/evals.test.ts` derives every one of those answers through the tools, so a change to a tool or to the seeded workspace that would invalidate a question fails the build rather than being found by whoever runs the evaluation.

## Design notes worth knowing

- **The scheduler is real.** `src/core/srs.ts` is a compact SM-2 variant. `ease` and `lapses` are what make `get_weak_topics` a measurement rather than a guess. An agent reasoning about "what am I bad at" needs a signal with history behind it.
- **Human control stays visible.** Core deck, card, date and study actions remain available by hand; agent-native queue, attention and planning actions render on the same board and enter the same activity feed.
- **Tools declare current WebMCP safety hints.** Every tool carries `readOnlyHint` and `untrustedContentHint`, declared in one place over the finished list so a new tool cannot ship without an explicit stance.
- **Destructive changes need a human, not a claim.** A `confirm: true` parameter would only be the agent's assertion that it asked. `delete_card` instead puts the request on the student's screen and returns immediately, having deleted nothing. The agent polls `get_approval`; only a click on Allow carries the deletion out. An agent can ask and can read the answer, but it cannot answer for the student.
- **Tool descriptions are written for an agent, not for docs.** Each one says when to reach for it, e.g. `annotate_card`: *"explaining once in chat is forgotten, a note on the card is not."*
- **Errors are recoverable.** A bad deck name returns the list of real deck names; a bad topic returns the deck's topics. The agent can fix itself in one turn.
- **Deck arguments accept names, not just ids**, so the agent can pass through what the student actually said.
- **Every tool returns both prose and `structuredContent`**, so an agent gets a readable answer and a parseable one.
- **One primary action per screen.** The dashboard leads with what is due and a single green button; everything else is secondary or quiet. The study card is the only thing on its screen with real visual weight.
- **Contrast is measured, not eyeballed.** Every text and background pair in use clears WCAG AA. The audits found three real failures: muted hints at 3.4:1, withdrawn tool chips near 2:1 and the light-theme human badge below AA. All were fixed rather than waived, and `npm run a11y` fails the build if a new one appears.
- **The stylesheet is a system, not a pile.** [docs/design-system.md](./docs/design-system.md) has the tokens and component variants. Nothing outside the token block declares a raw colour, size or radius, which is what made a second theme a matter of redefining that block rather than a rewrite.
- **Two themes, measured the same way.** Light follows the system setting unless the student picks one, and their choice is stored under its own key so restoring the sample decks does not change how the page looks. The light accents are darker than their dark theme counterparts because the dark green reads at 1.7:1 on white; every pair in both themes clears AA, and `npm run a11y` scans both.

## Stack

React 19 · TypeScript · Vite · zero runtime dependencies beyond React. State persists to `localStorage`; there is no backend and nothing leaves the browser.

## Licence

MIT. See [LICENSE](./LICENSE).
