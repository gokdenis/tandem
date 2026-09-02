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

  get names(): string[] {
    return [...this.live.keys()]
  }

  async sync(tools: ToolDescriptor[]): Promise<void> {
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

    for (const tool of tools) {
      if (this.live.has(tool.name)) continue
      const controller = new AbortController()
      try {
        await ctx.registerTool(tool, { signal: controller.signal })
        this.live.set(tool.name, controller)
      } catch (err) {
        console.error(`[webmcp] failed to register tool "${tool.name}"`, err)
      }
    }
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
