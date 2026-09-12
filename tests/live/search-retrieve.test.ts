import { describe, expect, it } from "vitest";
import { createJinaFetchPageTool } from "@/lib/tools/fetch-page/jina";
import { createTavilySearchTool } from "@/lib/tools/search/tavily";

const enabled = process.env.LIVE_API_TESTS === "1";

describe.skipIf(!enabled)("live Tavily search", () => {
  it("returns normalized search results", async () => {
    const tool = createTavilySearchTool();
    const result = await tool.execute(
      { query: "Stripe competitors pricing" },
      {},
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.results.length).toBeGreaterThan(0);
    expect(result.data.results.length).toBeLessThanOrEqual(5);
    for (const hit of result.data.results) {
      expect(hit.url.startsWith("http")).toBe(true);
      expect(hit.title.trim().length).toBeGreaterThan(0);
    }
  }, 30_000);
});

describe.skipIf(!enabled)("live Jina retrieval", () => {
  it("returns readable page content", async () => {
    const tool = createJinaFetchPageTool();
    const result = await tool.execute(
      { url: "https://example.com" },
      {},
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.content.trim().length).toBeGreaterThan(0);
    expect(result.data.content.length).toBeLessThanOrEqual(12_000);
    expect(result.data.httpStatus).toBe(200);
  }, 30_000);
});
