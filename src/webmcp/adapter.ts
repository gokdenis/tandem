import type { ModelContext, ToolDescriptor } from './types'

export type WebMCPStatus =
  | { supported: false; reason: string }
  | { supported: true; surface: 'document.modelContext' | 'navigator.modelContext'; mode: 'registerTool' | 'provideContext' }

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
  return { supported: false, reason: `modelContext found on ${surface} but it exposes neither registerTool() nor provideContext().` }
}

/**
 * Registers every tool with whichever WebMCP surface this browser implements.
 * Returns an unregister function. Safe to call when WebMCP is absent (no-op).
 */
export async function registerTools(tools: ToolDescriptor[]): Promise<() => void> {
  const found = findModelContext()
  if (!found) return () => {}

  const { ctx } = found
  const controller = new AbortController()

  if (typeof ctx.registerTool === 'function') {
    for (const tool of tools) {
      try {
        await ctx.registerTool(tool, { signal: controller.signal })
      } catch (err) {
        console.error(`[webmcp] failed to register tool "${tool.name}"`, err)
      }
    }
    return () => controller.abort()
  }

  if (typeof ctx.provideContext === 'function') {
    try {
      await ctx.provideContext({ tools })
    } catch (err) {
      console.error('[webmcp] provideContext failed', err)
    }
    return () => {
      try {
        ctx.provideContext?.({ tools: [] })
      } catch {
        /* ignore */
      }
    }
  }

  return () => {}
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
