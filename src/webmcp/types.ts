/**
 * Minimal ambient typings for the WebMCP browser API.
 *
 * The specification (webmachinelearning/webmcp) exposes the entry point on
 * `document.modelContext`. Earlier / alternative implementations shipped it on
 * `navigator.modelContext`, and some expose a bulk `provideContext()` instead of
 * per-tool `registerTool()`. We type all of the shapes we support and normalise
 * them in `adapter.ts` so the rest of the app never has to care.
 */

export type JSONSchema = {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

/** MCP-shaped result payload returned from a tool's execute(). */
export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
  /** Optional machine-readable payload; agents that support it get structure for free. */
  structuredContent?: unknown
}

/**
 * MCP-style behaviour hints. A browser or agent that understands them can decide
 * what to call freely and what to confirm first; one that does not simply
 * ignores them.
 */
export type ToolAnnotations = {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export type ToolDescriptor = {
  name: string
  description: string
  inputSchema: JSONSchema
  annotations?: ToolAnnotations
  execute: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult
}

export type RegisterOptions = { signal?: AbortSignal }

export interface ModelContext {
  registerTool?: (tool: ToolDescriptor, options?: RegisterOptions) => Promise<unknown> | unknown
  provideContext?: (context: { tools: ToolDescriptor[] }) => Promise<unknown> | unknown
  getTools?: () => Promise<unknown[]>
  addEventListener?: (type: string, listener: () => void) => void
  removeEventListener?: (type: string, listener: () => void) => void
}

declare global {
  interface Document {
    modelContext?: ModelContext
  }
  interface Navigator {
    modelContext?: ModelContext
  }
}

