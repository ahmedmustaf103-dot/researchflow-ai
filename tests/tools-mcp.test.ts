import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createToolRegistry } from "@/lib/tools";
import type {
  InternalTool,
  MCPClient,
  MCPServerConfig,
  MCPToolDefinition,
  ToolResult,
} from "@/lib/tools";

const searchInput = z.object({
  query: z.string().min(1),
});

const searchTool: InternalTool<{ query: string }, { results: string[] }> = {
  source: "internal",
  name: "search",
  description: "Search the web",
  inputSchema: searchInput,
  async execute(input) {
    return { ok: true, data: { results: [`hit:${input.query}`] } };
  },
};

const mcpLookup: MCPToolDefinition = {
  source: "mcp",
  serverId: "demo-server",
  name: "lookup",
  description: "Look up a company via MCP",
  inputSchema: {
    type: "object",
    properties: { domain: { type: "string" } },
  },
};

class MockMCPClient implements MCPClient {
  private readonly connected = new Set<string>();

  async connect(config: MCPServerConfig) {
    this.connected.add(config.id);
  }

  async disconnect(serverId: string) {
    this.connected.delete(serverId);
  }

  async listTools(serverId: string): Promise<MCPToolDefinition[]> {
    if (!this.connected.has(serverId)) {
      throw new Error(`MCP server not connected: ${serverId}`);
    }

    return [{ ...mcpLookup, serverId }];
  }

  async callTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (!this.connected.has(serverId)) {
      return { ok: false, error: "not connected", retryable: true };
    }

    if (name !== "lookup") {
      return { ok: false, error: `unknown MCP tool: ${name}`, retryable: false };
    }

    return { ok: true, data: { domain: args.domain, source: "mcp" } };
  }
}

describe("tool registry and MCP abstractions", () => {
  it("keeps internal tools and MCP tools in separate collections", () => {
    const registry = createToolRegistry();
    registry.registerInternal(searchTool);
    registry.registerMcp(mcpLookup);

    expect(registry.getInternal("search")?.source).toBe("internal");
    expect(registry.getMcp("demo-server", "lookup")?.source).toBe("mcp");
    expect(registry.getInternal("lookup")).toBeUndefined();
    expect(registry.listAll()).toHaveLength(2);
  });

  it("allows an internal tool and an MCP tool to share a name", () => {
    const registry = createToolRegistry();
    registry.registerInternal(searchTool);
    registry.registerMcp({
      ...mcpLookup,
      name: "search",
    });

    expect(registry.getInternal("search")?.source).toBe("internal");
    expect(registry.getMcp("demo-server", "search")?.source).toBe("mcp");
  });

  it("rejects duplicate internal tool names", () => {
    const registry = createToolRegistry();
    registry.registerInternal(searchTool);

    expect(() => registry.registerInternal(searchTool)).toThrow(
      /already registered/,
    );
  });

  it("executes a mocked internal tool", async () => {
    const result = await searchTool.execute({ query: "Stripe" }, {});

    expect(result).toEqual({
      ok: true,
      data: { results: ["hit:Stripe"] },
    });
  });

  it("discovers and calls tools through a mocked MCP client", async () => {
    const client: MCPClient = new MockMCPClient();
    await client.connect({
      id: "demo-server",
      name: "Demo",
      transport: "stdio",
      command: "echo",
    });

    const tools = await client.listTools("demo-server");
    expect(tools).toHaveLength(1);
    expect(tools[0]?.source).toBe("mcp");

    const result = await client.callTool("demo-server", "lookup", {
      domain: "stripe.com",
    });

    expect(result).toEqual({
      ok: true,
      data: { domain: "stripe.com", source: "mcp" },
    });
  });

  it("fails closed when an MCP server is not connected", async () => {
    const client = new MockMCPClient();

    await expect(client.listTools("demo-server")).rejects.toThrow(
      /not connected/,
    );
  });
});
