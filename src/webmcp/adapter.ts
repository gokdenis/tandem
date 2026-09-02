import type { ModelContext, ToolDescriptor } from './types'

export type WebMCPStatus =
  | { supported: false; reason: string }
  | {
      supported: true
      surface: 'document.modelContext' | 'navigator.modelContext'
      mode: 'registerTool' | 'provideContext'
    }

function findModelContext(): { ctx: ModelContext; surface: 'document.modelContext' | 'navigator.modelContext' } | null {
  if (typeof document !== 'undefined' && document.modelContext) {
    return { ctx: document.modelContext, surface: 'document.modelContext' }
  }
  if (typeof navigator !== 'undefined' && navigator.modelContext) {
    return { ctx: navigator.modelContext, surface: 'navigator.modelContext' }
  }
  return null
}

export function detectWebMCP(): WebMCPStatus {
  const found = findModelContext()
  if (!found) {
    return {
      supported: false,
      reason:
        'No modelContext found. Open this page in ChatGPT’s in-app browser, or in Chrome with chrome://flags/#enable-webmcp-testing enabled.',
    }
  }
  const { ctx, surface } = found
  if (typeof ctx.registerTool === 'function') return { supported: true, surface, mode: 'registerTool' }
  if (typeof ctx.provideContext === 'function') return { supported: true, surface, mode: 'provideContext' }
  return {
    supported: false,
    reason: `modelContext found on ${surface} but it exposes neither registerTool() nor provideContext().`,
  }
}

/**
 * Keeps the browser's tool surface in step with application state.
 *
 * Tandem does not register a fixed list once. The tools an agent can see depend
 * on what the student is doing: grade_current_card has no meaning when no card
 * is on screen, and start_session has none while a session is already running.
 * sync() diffs the requested set against what is currently registered and only
 * touches the difference, so a stable tool is never re-registered and can never
 * end up duplicated if a browser treats an aborted signal as a no-op.
 */
export class ToolRegistry {
  private live = new Map<string, AbortController>()
  /** Serialises syncs so two overlapping calls cannot register the same tool twice. */
  private queue: Promise<void> = Promise.resolve()
  private wanted: ToolDescriptor[] | null = null
  /** Set once if the host turned out not to accept annotations. */
  private degraded = false

  get names(): string[] {
    return [...this.live.keys()]
  }

  /**
   * Bring the browser's tool surface in line with the requested set.
   *
   * Registration is asynchronous, so two syncs started close together used to
   * both look at an empty registry and both register: an agent saw every tool
   * twice. Calls are now serialised, and a sync that arrives while another is
   * running replaces the pending target rather than queueing behind it, since
   * only the latest state is worth reaching.
   */
  sync(tools: ToolDescriptor[]): Promise<void> {
    this.wanted = tools
    this.queue = this.queue.then(() => this.run())
    return this.queue
  }

  private async run(): Promise<void> {
    const tools = this.wanted
    if (!tools) return
    this.wanted = null

    const found = findModelContext()
    if (!found) return
    const { ctx } = found

    // Bulk surface: hand over the whole set and let the browser diff it.
    if (typeof ctx.registerTool !== 'function' && typeof ctx.provideContext === 'function') {
      try {
        await ctx.provideContext({ tools })
        this.live.clear()
        for (const t of tools) this.live.set(t.name, new AbortController())
      } catch (err) {
        console.error('[webmcp] provideContext failed', err)
      }
      return
    }

    if (typeof ctx.registerTool !== 'function') return

    const wanted = new Set(tools.map((t) => t.name))

    for (const [name, controller] of [...this.live]) {
      if (!wanted.has(name)) {
        controller.abort()
        this.live.delete(name)
      }
    }

    // Claim each name before awaiting, so nothing can slip in behind the await,
    // and register in one round rather than twenty sequential ones.
    const pending = tools
      .filter((tool) => !this.live.has(tool.name))
      .map(async (tool) => {
        const controller = new AbortController()
        this.live.set(tool.name, controller)
        try {
          await ctx.registerTool!(tool, { signal: controller.signal })
        } catch (err) {
          // Current WebMCP hosts accept safety annotations. Some earlier
          // experimental hosts validated the pre-annotation descriptor shape,
          // so retry without annotations to keep the core tool available there.
          const { annotations: _dropped, ...core } = tool
          try {
            await ctx.registerTool!(core as ToolDescriptor, { signal: controller.signal })
            if (!this.degraded) {
              this.degraded = true
              console.warn('[webmcp] host rejected tool annotations; registering without them')
            }
          } catch (retryErr) {
            console.error(`[webmcp] failed to register tool "${tool.name}"`, retryErr ?? err)
            this.live.delete(tool.name)
          }
        }
      })

    await Promise.all(pending)
  }

  dispose() {
    for (const controller of this.live.values()) controller.abort()
    this.live.clear()
  }
}

/**
 * How many tools the browser itself thinks are registered. Reading this back
 * through getTools() rather than counting our own array is the only honest way
 * to show that registration and unregistration actually took effect.
 */
export async function browserToolCount(): Promise<number | null> {
  const found = findModelContext()
  if (!found || typeof found.ctx.getTools !== 'function') return null
  try {
    const tools = await found.ctx.getTools()
    return Array.isArray(tools) ? tools.length : null
  } catch {
    return null
  }
}

/** Subscribe to the spec's toolchange event. Returns an unsubscribe function. */
export function onToolChange(listener: () => void): () => void {
  const found = findModelContext()
  const target = found?.ctx as unknown as EventTarget | undefined
  if (!target || typeof target.addEventListener !== 'function') return () => {}
  target.addEventListener('toolchange', listener)
  return () => {
    try {
      target.removeEventListener?.('toolchange', listener)
    } catch {
      /* older surfaces may not implement removal */
    }
  }
}

/** Convenience helpers for building MCP-shaped results. */
export const ok = (text: string, structuredContent?: unknown) => ({
  content: [{ type: 'text' as const, text }],
  ...(structuredContent === undefined ? {} : { structuredContent }),
})

export const fail = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  isError: true,
})
