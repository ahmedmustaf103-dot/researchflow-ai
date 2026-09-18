import { afterEach, describe, expect, it } from "vitest";
import {
  COMPANY_RESEARCH_SERVER_ID,
  LOOKUP_COMPANY_PROFILE_TOOL,
  companyProfileSchema,
  createCompanyResearchServerConfig,
  createInProcessMcpClient,
  createStdioMcpClient,
  lookupCompanyProfile,
  formatCompanyProfileContent,
} from "@/lib/tools/mcp";
import type { MCPClient, MCPServerConfig, MCPToolDefinition } from "@/lib/tools/mcp";
import type { ToolResult } from "@/lib/tools/types";

describe("company profile MCP server (fixture lookup)", () => {
  it("returns a structured fixture profile for a known domain", () => {
    const result = lookupCompanyProfile({ domain: "stripe.com" });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const profile = companyProfileSchema.parse(result.profile);
    expect(profile.name).toBe("Stripe");
    expect(profile.products.length).toBeGreaterThan(0);
    expect(formatCompanyProfileContent(profile)).toContain("Stripe");
    expect(formatCompanyProfileContent(profile)).toContain("fixture");
  });

  it("normalizes www and rejects unknown domains without fabricating data", () => {
    const known = lookupCompanyProfile({ domain: "www.adyen.com" });
    expect(known.ok).toBe(true);
    if (known.ok) {
      expect(known.profile.domain).toBe("adyen.com");
    }

    const unknown = lookupCompanyProfile({ domain: "not-a-real-company.test" });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.code).toBe("not_found");
      expect(unknown.error).toMatch(/Unknown company domain/);
    }
  });

  it("rejects invalid input", () => {
    const result = lookupCompanyProfile({ domain: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_input");
    }
  });
});

describe("MCP client protocol boundary", () => {
  const clients: MCPClient[] = [];

  afterEach(async () => {
    await Promise.all(
      clients.splice(0).map((client) =>
        client.disconnect(COMPANY_RESEARCH_SERVER_ID).catch(() => undefined),
      ),
    );
  });

  it("discovers and calls lookup_company_profile over in-process MCP protocol", async () => {
    const client = createInProcessMcpClient();
    clients.push(client);
    await client.connect(createCompanyResearchServerConfig());

    const tools = await client.listTools(COMPANY_RESEARCH_SERVER_ID);
    expect(tools.some((tool) => tool.name === LOOKUP_COMPANY_PROFILE_TOOL)).toBe(
      true,
    );

    const result = await client.callTool(
      COMPANY_RESEARCH_SERVER_ID,
      LOOKUP_COMPANY_PROFILE_TOOL,
      { domain: "paypal.com" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const profile = companyProfileSchema.parse(result.data);
      expect(profile.name).toBe("PayPal");
    }
  });

  it("maps unknown-domain tool errors without retrying as success", async () => {
    const client = createInProcessMcpClient();
    clients.push(client);
    await client.connect(createCompanyResearchServerConfig());

    const result = await client.callTool(
      COMPANY_RESEARCH_SERVER_ID,
      LOOKUP_COMPANY_PROFILE_TOOL,
      { domain: "unknown.example" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(false);
      expect(result.error).toMatch(/Unknown company domain/);
    }
  });

  it("rejects malformed MCP responses", async () => {
    const client: MCPClient = {
      async connect() {},
      async disconnect() {},
      async listTools(): Promise<MCPToolDefinition[]> {
        return [];
      },
      async callTool(): Promise<ToolResult> {
        return { ok: true, data: { domain: "stripe.com" } };
      },
    };

    const result = await client.callTool(
      COMPANY_RESEARCH_SERVER_ID,
      LOOKUP_COMPANY_PROFILE_TOOL,
      { domain: "stripe.com" },
    );
    expect(result.ok).toBe(true);
    expect(companyProfileSchema.safeParse(result.ok ? result.data : null).success).toBe(
      false,
    );
  });

  it("maps transport failures into ToolResult errors", async () => {
    const client = createInProcessMcpClient();
    const result = await client.callTool(
      COMPANY_RESEARCH_SERVER_ID,
      LOOKUP_COMPANY_PROFILE_TOOL,
      { domain: "stripe.com" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not connected/);
    }
  });

  it("connects over real stdio to the fixture MCP server", async () => {
    const client = createStdioMcpClient();
    clients.push(client);
    const config: MCPServerConfig = createCompanyResearchServerConfig();
    await client.connect(config);

    const result = await client.callTool(
      COMPANY_RESEARCH_SERVER_ID,
      LOOKUP_COMPANY_PROFILE_TOOL,
      { domain: "stripe.com" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(companyProfileSchema.parse(result.data).name).toBe("Stripe");
    }
  }, 20_000);
});
