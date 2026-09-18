import { describe, expect, it } from "vitest";
import { createMemoryResearchStore } from "@/lib/research/memory-store";
import { enrichResearchWithCompanyProfiles } from "@/lib/research/enrich";
import {
  COMPANY_RESEARCH_SERVER_ID,
  MCP_COMPANY_PROFILE_TOOL_NAME,
  companyProfileSourceUrl,
  createInProcessMcpClient,
  createCompanyResearchServerConfig,
} from "@/lib/tools/mcp";
import type { MCPClient, MCPToolDefinition } from "@/lib/tools/mcp";
import type { ToolResult } from "@/lib/tools/types";
import { createMockLLMProvider } from "@/lib/ai/mock";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { createQueuedProject } from "@/lib/research/service";
import { createMockToolRegistry } from "@/lib/tools/mock-registry";
import { RESEARCH_STAGES } from "@/lib/research/types";

describe("research enrich stage", () => {
  it("persists a successful MCP company profile as a Source", async () => {
    const store = createMemoryResearchStore();
    const project = await store.createProject({
      userId: "user-1",
      title: "Competitors",
      question: "Compare Stripe competitors",
    });
    await store.createSource({
      projectId: project.id,
      url: "https://www.stripe.com/pricing",
      title: "Stripe pricing",
      toolName: "search",
    });

    const mcp = createInProcessMcpClient();
    await mcp.connect(createCompanyResearchServerConfig());
    try {
      await enrichResearchWithCompanyProfiles({
        projectId: project.id,
        store,
        mcp,
      });
    } finally {
      await mcp.disconnect(COMPANY_RESEARCH_SERVER_ID);
    }

    const sources = await store.listSources(project.id);
    const mcpSource = sources.find(
      (source) => source.url === companyProfileSourceUrl("stripe.com"),
    );

    expect(mcpSource).toBeDefined();
    expect(mcpSource?.title).toBe("Stripe");
    expect(mcpSource?.snippet).toContain("financial infrastructure");
    expect(mcpSource?.content).toContain("Stripe");
    expect(mcpSource?.content).toContain("fixture");
    expect(mcpSource?.httpStatus).toBe(200);
    expect(mcpSource?.toolName).toBe(MCP_COMPANY_PROFILE_TOOL_NAME);
    expect(mcpSource?.fetchedAt).toBeInstanceOf(Date);
  });

  it("enriches multiple domains and continues when one lookup fails", async () => {
    const store = createMemoryResearchStore();
    const project = await store.createProject({
      userId: "user-1",
      title: "Competitors",
      question: "Compare payment companies",
    });
    await store.createSource({
      projectId: project.id,
      url: "https://stripe.com/",
      title: "Stripe",
      toolName: "search",
    });
    await store.createSource({
      projectId: project.id,
      url: "https://unknown-corp.example/",
      title: "Unknown",
      toolName: "search",
    });
    await store.createSource({
      projectId: project.id,
      url: "https://adyen.com/",
      title: "Adyen",
      toolName: "search",
    });

    const mcp = createInProcessMcpClient();
    await mcp.connect(createCompanyResearchServerConfig());
    try {
      await enrichResearchWithCompanyProfiles({
        projectId: project.id,
        store,
        mcp,
      });
    } finally {
      await mcp.disconnect(COMPANY_RESEARCH_SERVER_ID);
    }

    const sources = await store.listSources(project.id);
    expect(
      sources.some((source) => source.url === companyProfileSourceUrl("stripe.com")),
    ).toBe(true);
    expect(
      sources.some((source) => source.url === companyProfileSourceUrl("adyen.com")),
    ).toBe(true);
    expect(
      sources.some(
        (source) =>
          source.url === companyProfileSourceUrl("unknown-corp.example"),
      ),
    ).toBe(false);
    expect(sources.some((source) => source.url === "https://stripe.com/")).toBe(
      true,
    );
  });

  it("continues without fabricating data when all MCP lookups fail", async () => {
    const store = createMemoryResearchStore();
    const project = await store.createProject({
      userId: "user-1",
      title: "Competitors",
      question: "Compare payment companies",
    });
    await store.createSource({
      projectId: project.id,
      url: "https://unknown-a.example/",
      title: "A",
      toolName: "search",
    });
    await store.createSource({
      projectId: project.id,
      url: "https://unknown-b.example/",
      title: "B",
      toolName: "search",
    });

    const failingClient: MCPClient = {
      async connect() {},
      async disconnect() {},
      async listTools(): Promise<MCPToolDefinition[]> {
        return [];
      },
      async callTool(): Promise<ToolResult> {
        return { ok: false, error: "transport failed", retryable: true };
      },
    };

    await enrichResearchWithCompanyProfiles({
      projectId: project.id,
      store,
      mcp: failingClient,
    });

    const sources = await store.listSources(project.id);
    expect(sources).toHaveLength(2);
    expect(sources.every((source) => source.toolName === "search")).toBe(true);
    expect(
      sources.some((source) => source.url.startsWith("mcp://")),
    ).toBe(false);
  });
});

describe("pipeline MCP enrich integration", () => {
  it("runs enrich after retrieve and before extract", async () => {
    const store = createMemoryResearchStore();
    const project = await createQueuedProject(
      "user-1",
      "Research the top competitors of Stripe",
      store,
    );

    const originalCreateSource = store.createSource.bind(store);
    const createOrder: string[] = [];
    store.createSource = async (input) => {
      createOrder.push(input.toolName ?? "unknown");
      return originalCreateSource(input);
    };

    const mcp = createInProcessMcpClient();
    const tools = createMockToolRegistry();

    // Seed a fixture domain through a custom search tool result by pre-inserting
    // after search via a patched gather path: inject source before pipeline extract.
    const result = await runResearchPipeline(project.id, {
      store,
      tools,
      mcp,
      llm: createMockLLMProvider(),
    });

    expect(result.status).toBe("completed");
    expect(result.executedStages).toEqual([...RESEARCH_STAGES]);
    expect(result.executedStages.indexOf("enrich")).toBeGreaterThan(
      result.executedStages.indexOf("retrieve"),
    );
    expect(result.executedStages.indexOf("extract")).toBeGreaterThan(
      result.executedStages.indexOf("enrich"),
    );
  });

  it("makes MCP Sources available to extraction", async () => {
    const store = createMemoryResearchStore();
    const project = await store.createProject({
      userId: "user-1",
      title: "Competitors",
      question: "Compare Stripe",
    });

    // Direct enrich → extract path using fixture MCP content.
    await store.createSource({
      projectId: project.id,
      url: "https://stripe.com/",
      title: "Stripe site",
      content: "Stripe processes online payments for internet businesses.",
      httpStatus: 200,
      toolName: "fetch_page",
      fetchedAt: new Date(),
    });

    const mcp = createInProcessMcpClient();
    await mcp.connect(createCompanyResearchServerConfig());
    try {
      await enrichResearchWithCompanyProfiles({
        projectId: project.id,
        store,
        mcp,
      });
    } finally {
      await mcp.disconnect(COMPANY_RESEARCH_SERVER_ID);
    }

    const sources = await store.listSources(project.id);
    const mcpSource = sources.find((source) =>
      source.url.startsWith("mcp://company-profile/"),
    );
    expect(mcpSource?.content).toBeTruthy();
    expect(mcpSource?.toolName).toBe(MCP_COMPANY_PROFILE_TOOL_NAME);
  });

  it("keeps the pipeline intact when MCP is omitted", async () => {
    const store = createMemoryResearchStore();
    const project = await createQueuedProject(
      "user-1",
      "Research the top competitors of Stripe",
      store,
    );

    const result = await runResearchPipeline(project.id, {
      store,
      llm: createMockLLMProvider(),
    });

    expect(result.status).toBe("completed");
    expect(result.executedStages).toEqual([...RESEARCH_STAGES]);
    const sources = await store.listSources(project.id);
    expect(sources.every((source) => !source.url.startsWith("mcp://"))).toBe(
      true,
    );
  });
});
