import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCompanyResearchMcpServer } from "./servers/company-research";
import {
  companyProfileSchema,
  type CompanyProfile,
  COMPANY_RESEARCH_SERVER_ID,
  LOOKUP_COMPANY_PROFILE_TOOL,
} from "./schemas";
import type {
  MCPClient,
  MCPServerConfig,
  MCPToolDefinition,
} from "./types";
import type { ToolResult } from "../types";
import { mapUnknownToolError, ToolError } from "../errors";
import { withRetries } from "../retry";

/** Bounded retries for transient MCP transport failures only. */
const MAX_MCP_TRANSPORT_RETRIES = 1;

type ConnectedSession = {
  client: Client;
  close: () => Promise<void>;
};

function isTransientTransportError(error: unknown): boolean {
  if (error instanceof ToolError) {
    return error.retryable;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("transport") ||
    message.includes("econnreset") ||
    message.includes("epipe") ||
    message.includes("socket") ||
    message.includes("closed") ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function extractTextContent(result: unknown): string {
  const record = asRecord(result);
  const content = record?.content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      const item = asRecord(block);
      return item?.type === "text" && typeof item.text === "string"
        ? item.text
        : "";
    })
    .filter(Boolean)
    .join(" ");
}

function extractStructuredPayload(result: unknown): unknown {
  const record = asRecord(result);
  if (!record) {
    return undefined;
  }

  if (record.structuredContent !== undefined) {
    return record.structuredContent;
  }

  const text = extractTextContent(result);
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapCallToolResult(
  name: string,
  raw: unknown,
): ToolResult {
  const record = asRecord(raw);
  if (record?.isError) {
    const payload = extractStructuredPayload(raw);
    const message =
      typeof payload === "string" && payload.trim()
        ? payload
        : extractTextContent(raw) || `MCP tool error: ${name}`;

    return {
      ok: false,
      error: message,
      retryable: false,
    };
  }

  if (name === LOOKUP_COMPANY_PROFILE_TOOL) {
    const payload = extractStructuredPayload(raw);
    const parsed = companyProfileSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        error: `Malformed MCP response for ${name}: ${parsed.error.issues[0]?.message ?? "invalid payload"}`,
        retryable: false,
      };
    }

    return { ok: true, data: parsed.data satisfies CompanyProfile };
  }

  return { ok: true, data: extractStructuredPayload(raw) };
}

function defaultStdioServerPath(): string {
  return path.join(
    process.cwd(),
    "lib/tools/mcp/servers/company-research-stdio.mjs",
  );
}

export function createCompanyResearchServerConfig(
  overrides: Partial<MCPServerConfig> = {},
): MCPServerConfig {
  return {
    id: COMPANY_RESEARCH_SERVER_ID,
    name: "Company Research",
    transport: "stdio",
    command: process.execPath,
    args: [defaultStdioServerPath()],
    ...overrides,
  };
}

export class StdioMCPClient implements MCPClient {
  private readonly sessions = new Map<string, ConnectedSession>();

  async connect(config: MCPServerConfig): Promise<void> {
    if (this.sessions.has(config.id)) {
      return;
    }

    if (config.transport !== "stdio") {
      throw new ToolError(
        `Unsupported MCP transport for ${config.id}: ${config.transport}`,
        { code: "config", retryable: false },
      );
    }

    if (!config.command) {
      throw new ToolError(`MCP server ${config.id} is missing a command`, {
        code: "config",
        retryable: false,
      });
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      stderr: "pipe",
    });

    const client = new Client({
      name: "researchflow-mcp-client",
      version: "1.0.0",
    });

    await client.connect(transport);

    this.sessions.set(config.id, {
      client,
      close: async () => {
        await client.close();
        await transport.close();
      },
    });
  }

  async disconnect(serverId: string): Promise<void> {
    const session = this.sessions.get(serverId);
    if (!session) {
      return;
    }

    this.sessions.delete(serverId);
    await session.close();
  }

  async listTools(serverId: string): Promise<MCPToolDefinition[]> {
    const session = this.requireSession(serverId);
    const listed = await session.client.listTools();

    return listed.tools.map((tool) => ({
      source: "mcp" as const,
      serverId,
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
    }));
  }

  async callTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    try {
      const session = this.requireSession(serverId);

      const raw = await withRetries(
        async () =>
          session.client.callTool({
            name,
            arguments: args,
          }),
        {
          maxRetries: MAX_MCP_TRANSPORT_RETRIES,
          isRetryable: isTransientTransportError,
        },
      );

      return mapCallToolResult(name, raw);
    } catch (error) {
      const mapped = mapUnknownToolError(error, `MCP call failed: ${name}`);
      return {
        ok: false,
        error: mapped.message,
        retryable: mapped.retryable,
        statusCode: mapped.statusCode,
      };
    }
  }

  private requireSession(serverId: string): ConnectedSession {
    const session = this.sessions.get(serverId);
    if (!session) {
      throw new ToolError(`MCP server not connected: ${serverId}`, {
        code: "config",
        retryable: false,
      });
    }
    return session;
  }
}

/**
 * In-process MCP client that still speaks the MCP protocol over linked
 * in-memory transports. Useful for fast tests without spawning a child process.
 */
export class InProcessMCPClient implements MCPClient {
  private readonly sessions = new Map<string, ConnectedSession>();

  async connect(config: MCPServerConfig): Promise<void> {
    if (this.sessions.has(config.id)) {
      return;
    }

    if (config.id !== COMPANY_RESEARCH_SERVER_ID) {
      throw new ToolError(`Unknown MCP server: ${config.id}`, {
        code: "config",
        retryable: false,
      });
    }

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createCompanyResearchMcpServer();
    const client = new Client({
      name: "researchflow-mcp-client",
      version: "1.0.0",
    });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    this.sessions.set(config.id, {
      client,
      close: async () => {
        await client.close();
        await server.close();
      },
    });
  }

  async disconnect(serverId: string): Promise<void> {
    const session = this.sessions.get(serverId);
    if (!session) {
      return;
    }
    this.sessions.delete(serverId);
    await session.close();
  }

  async listTools(serverId: string): Promise<MCPToolDefinition[]> {
    const session = this.requireSession(serverId);
    const listed = await session.client.listTools();
    return listed.tools.map((tool) => ({
      source: "mcp" as const,
      serverId,
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
    }));
  }

  async callTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    try {
      const session = this.requireSession(serverId);
      const raw = await withRetries(
        async () =>
          session.client.callTool({
            name,
            arguments: args,
          }),
        {
          maxRetries: MAX_MCP_TRANSPORT_RETRIES,
          isRetryable: isTransientTransportError,
        },
      );

      return mapCallToolResult(name, raw);
    } catch (error) {
      const mapped = mapUnknownToolError(error, `MCP call failed: ${name}`);
      return {
        ok: false,
        error: mapped.message,
        retryable: mapped.retryable,
        statusCode: mapped.statusCode,
      };
    }
  }

  private requireSession(serverId: string): ConnectedSession {
    const session = this.sessions.get(serverId);
    if (!session) {
      throw new ToolError(`MCP server not connected: ${serverId}`, {
        code: "config",
        retryable: false,
      });
    }
    return session;
  }
}

export function createStdioMcpClient(): MCPClient {
  return new StdioMCPClient();
}

export function createInProcessMcpClient(): MCPClient {
  return new InProcessMCPClient();
}
