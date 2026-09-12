import type { ZodType } from "zod";

export interface ToolContext {
  userId?: string;
  projectId?: string;
}

export type ToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; retryable: boolean; statusCode?: number };

/**
 * First-party tools owned by ResearchFlow (search, fetch, etc.).
 * Distinct from MCP tools, which come from external MCP servers.
 */
export interface InternalTool<TInput = unknown, TOutput = unknown> {
  readonly source: "internal";
  name: string;
  description: string;
  inputSchema: ZodType<TInput>;
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
}
