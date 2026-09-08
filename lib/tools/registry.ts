import type { InternalTool } from "./types";
import type { MCPToolDefinition } from "./mcp";
import { mcpToolKey } from "./mcp";

type StoredInternalTool = InternalTool<unknown, unknown>;

export type RegisteredTool =
  | { source: "internal"; tool: StoredInternalTool }
  | { source: "mcp"; tool: MCPToolDefinition };

/**
 * Agent → Tool Registry → Internal Tools | MCP Tools
 */
export class ToolRegistry {
  private readonly internalTools = new Map<string, StoredInternalTool>();
  private readonly mcpTools = new Map<string, MCPToolDefinition>();

  registerInternal<TInput, TOutput>(tool: InternalTool<TInput, TOutput>): void {
    if (this.internalTools.has(tool.name)) {
      throw new Error(`Internal tool already registered: ${tool.name}`);
    }

    this.internalTools.set(tool.name, tool as StoredInternalTool);
  }

  registerMcp(tool: MCPToolDefinition): void {
    const key = mcpToolKey(tool);

    if (this.mcpTools.has(key)) {
      throw new Error(`MCP tool already registered: ${key}`);
    }

    this.mcpTools.set(key, tool);
  }

  getInternal(name: string): StoredInternalTool | undefined {
    return this.internalTools.get(name);
  }

  getMcp(serverId: string, name: string): MCPToolDefinition | undefined {
    return this.mcpTools.get(mcpToolKey({ serverId, name }));
  }

  listInternal(): StoredInternalTool[] {
    return [...this.internalTools.values()];
  }

  listMcp(): MCPToolDefinition[] {
    return [...this.mcpTools.values()];
  }

  listAll(): RegisteredTool[] {
    return [
      ...this.listInternal().map((tool) => ({ source: "internal" as const, tool })),
      ...this.listMcp().map((tool) => ({ source: "mcp" as const, tool })),
    ];
  }
}

export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
