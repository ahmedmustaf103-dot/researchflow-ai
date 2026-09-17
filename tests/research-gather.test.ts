import { describe, expect, it } from "vitest";
import { createMockLLMProvider } from "@/lib/ai/mock";
import {
  MAX_FETCH_CONCURRENCY,
  MAX_PAGES_PER_PROJECT,
} from "@/lib/research/limits";
import { createMemoryResearchStore } from "@/lib/research/memory-store";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { createQueuedProject } from "@/lib/research/service";
import { createToolRegistry } from "@/lib/tools/registry";
import type { InternalTool, ToolResult } from "@/lib/tools/types";
import { fetchPageInputSchema } from "@/lib/tools/fetch-page";
import { searchInputSchema } from "@/lib/tools/search";
import type { FetchedPage, SearchHit } from "@/lib/research/types";

function searchTool(
  execute: (query: string) => Promise<ToolResult<{ results: SearchHit[] }>>,
): InternalTool {
  return {
    source: "internal",
    name: "search",
    description: "Test search",
    inputSchema: searchInputSchema,
    async execute(input) {
      const parsed = searchInputSchema.parse(input);
      return execute(parsed.query);
    },
  };
}

function fetchTool(
  execute: (url: string) => Promise<ToolResult<FetchedPage>>,
): InternalTool {
  return {
    source: "internal",
    name: "fetch_page",
    description: "Test fetch",
    inputSchema: fetchPageInputSchema,
    async execute(input) {
      const parsed = fetchPageInputSchema.parse(input);
      return execute(parsed.url);
    },
  };
}

function registry(
  search: InternalTool,
  fetchPage: InternalTool,
) {
  const tools = createToolRegistry();
  tools.registerInternal(search);
  tools.registerInternal(fetchPage);
  return tools;
}

function hit(url: string, title = url): SearchHit {
  return { url, title, snippet: `Snippet for ${url}` };
}

function page(url: string): FetchedPage {
  return {
    url,
    title: `Page ${url}`,
    content: `Content for ${url}`,
    httpStatus: 200,
  };
}

async function runWithTools(
  search: InternalTool,
  fetchPage: InternalTool,
  planTasks: Array<{ title: string; query: string; sortOrder: number }>,
) {
  const store = createMemoryResearchStore();
  const project = await createQueuedProject(
    "user-1",
    "Research the top competitors of Stripe",
    store,
  );

  const result = await runResearchPipeline(project.id, {
    store,
    llm: createMockLLMProvider({
      plan: {
        goal: "Compare Stripe competitors",
        dimensions: ["pricing"],
        tasks: planTasks,
      },
    }),
    tools: registry(search, fetchPage),
  });

  const detail = await store.getProjectDetail(project.id, "user-1");
  return { result, detail, store };
}

describe("research gather pipeline", () => {
  it("persists sources from multiple research tasks and continues to mocked extract", async () => {
    const { result, detail } = await runWithTools(
      searchTool(async (query) => ({
        ok: true,
        data: {
          results: [hit(`https://example.com/${query.replace(/\s+/g, "-")}`)],
        },
      })),
      fetchTool(async (url) => ({ ok: true, data: page(url) })),
      [
        { title: "Competitors", query: "stripe competitors", sortOrder: 1 },
        { title: "Pricing", query: "stripe pricing", sortOrder: 2 },
      ],
    );

    expect(result.status).toBe("completed");
    expect(detail?.sources).toHaveLength(2);
    expect(detail?.sources.every((source) => source.content?.startsWith("Content"))).toBe(true);
    expect(detail?.findings.length).toBeGreaterThan(0);
    expect(detail?.report?.markdown).toContain("Research report");
  });

  it("reuses a source when the same URL appears in multiple tasks", async () => {
    const { detail } = await runWithTools(
      searchTool(async () => ({
        ok: true,
        data: { results: [hit("https://example.com/shared")] },
      })),
      fetchTool(async (url) => ({ ok: true, data: page(url) })),
      [
        { title: "A", query: "query a", sortOrder: 1 },
        { title: "B", query: "query b", sortOrder: 2 },
      ],
    );

    expect(detail?.sources).toHaveLength(1);
    expect(detail?.sources[0]?.url).toBe("https://example.com/shared");
  });

  it("fetches at most 12 pages per project", async () => {
    const fetched: string[] = [];
    const { detail } = await runWithTools(
      searchTool(async (query) => {
        const offset = query.includes("1") ? 0 : query.includes("2") ? 5 : 10;
        return {
          ok: true,
          data: {
            results: Array.from({ length: 5 }, (_, index) =>
              hit(`https://example.com/page-${offset + index + 1}`),
            ),
          },
        };
      }),
      fetchTool(async (url) => {
        fetched.push(url);
        return { ok: true, data: page(url) };
      }),
      [
        { title: "Batch 1", query: "batch 1", sortOrder: 1 },
        { title: "Batch 2", query: "batch 2", sortOrder: 2 },
        { title: "Batch 3", query: "batch 3", sortOrder: 3 },
      ],
    );

    expect(detail?.sources.length).toBeGreaterThan(MAX_PAGES_PER_PROJECT);
    expect(fetched).toHaveLength(MAX_PAGES_PER_PROJECT);
    expect(detail?.sources.filter((source) => source.content)).toHaveLength(
      MAX_PAGES_PER_PROJECT,
    );
  });

  it("limits Jina retrieval concurrency to 3", async () => {
    let current = 0;
    let maxConcurrent = 0;

    await runWithTools(
      searchTool(async () => ({
        ok: true,
        data: {
          results: Array.from({ length: 6 }, (_, index) =>
            hit(`https://example.com/concurrent-${index + 1}`),
          ),
        },
      })),
      fetchTool(async (url) => {
        current += 1;
        maxConcurrent = Math.max(maxConcurrent, current);
        await new Promise((resolve) => setTimeout(resolve, 20));
        current -= 1;
        return { ok: true, data: page(url) };
      }),
      [{ title: "Scan", query: "concurrency", sortOrder: 1 }],
    );

    expect(maxConcurrent).toBeGreaterThan(1);
    expect(maxConcurrent).toBeLessThanOrEqual(MAX_FETCH_CONCURRENCY);
  });

  it("continues after a partial search failure", async () => {
    const { result, detail } = await runWithTools(
      searchTool(async (query) => {
        if (query.includes("fail")) {
          return { ok: false, error: "Search unavailable", retryable: true };
        }

        return {
          ok: true,
          data: { results: [hit("https://example.com/ok")] },
        };
      }),
      fetchTool(async (url) => ({ ok: true, data: page(url) })),
      [
        { title: "Failing task", query: "fail this query", sortOrder: 1 },
        { title: "Working task", query: "stripe pricing", sortOrder: 2 },
      ],
    );

    expect(result.status).toBe("completed");
    expect(detail?.tasks[0]?.status).toBe("failed");
    expect(detail?.tasks[1]?.status).toBe("completed");
    expect(detail?.sources).toHaveLength(1);
    expect(detail?.findings.length).toBeGreaterThan(0);
  });

  it("fails the project when every search fails", async () => {
    const { result, detail } = await runWithTools(
      searchTool(async () => ({
        ok: false,
        error: "Search unavailable",
        retryable: true,
      })),
      fetchTool(async (url) => ({ ok: true, data: page(url) })),
      [
        { title: "A", query: "query a", sortOrder: 1 },
        { title: "B", query: "query b", sortOrder: 2 },
      ],
    );

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/All searches failed/);
    expect(detail?.sources).toHaveLength(0);
    expect(detail?.report).toBeNull();
  });

  it("preserves a Source when retrieval fails and continues the pipeline", async () => {
    const { result, detail } = await runWithTools(
      searchTool(async () => ({
        ok: true,
        data: {
          results: [
            hit("https://example.com/ok", "Good source"),
            hit("https://example.com/fail", "Broken source"),
          ],
        },
      })),
      fetchTool(async (url) => {
        if (url.includes("fail")) {
          return { ok: false, error: "Jina 502", retryable: true, statusCode: 502 };
        }

        return { ok: true, data: page(url) };
      }),
      [{ title: "Scan", query: "stripe", sortOrder: 1 }],
    );

    const failed = detail?.sources.find((source) => source.url.includes("fail"));
    const succeeded = detail?.sources.find((source) => source.url.includes("ok"));

    expect(result.status).toBe("completed");
    expect(failed?.snippet).toBe("Snippet for https://example.com/fail");
    expect(failed?.content).toBeNull();
    expect(failed?.httpStatus).toBe(502);
    expect(succeeded?.content).toContain("Content");
    expect(detail?.findings.length).toBeGreaterThan(0);
  });
});
