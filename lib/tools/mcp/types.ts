import type { ToolResult } from "../types";

/**
 * JSON Schema as returned by MCP tool listing.
 * Kept as a structural type so we do not depend on an MCP SDK yet.
 */
export type JsonSchema = Record<string, unknown>;

export type MCPTransport = "stdio" | "sse" | "http";

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: MCPTransport;
  command?: string;
  args?: string[];
  url?: string;
}

/**
 * A tool discovered from an MCP server.
 * Execution goes through MCPClient, not through this definition.
 */
export interface MCPToolDefinition {
  readonly source: "mcp";
  serverId: string;
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

/**
 * Client used by the tool registry / research agent to talk to MCP servers.
 * Concrete transports are implemented in a later phase.
 */
export interface MCPClient {
  connect(config: MCPServerConfig): Promise<void>;
  disconnect(serverId: string): Promise<void>;
  listTools(serverId: string): Promise<MCPToolDefinition[]>;
  callTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult>;
}

export function mcpToolKey(
  tool: Pick<MCPToolDefinition, "serverId" | "name">,
): string {
  return `${tool.serverId}:${tool.name}`;
}
