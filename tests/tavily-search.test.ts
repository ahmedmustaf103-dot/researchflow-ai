import { describe, expect, it, vi } from "vitest";
import { MAX_SEARCH_RESULTS_PER_QUERY } from "@/lib/research/limits";
import {
  createTavilySearchTool,
  normalizeTavilyResults,
} from "@/lib/tools/search/tavily";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Tavily search", () => {
  it("returns normalized successful results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            title: "Stripe competitors",
            url: "https://example.com/stripe",
            content: "Adyen and PayPal",
            score: 0.91,
            published_date: "2024-01-15",
          },
        ],
      }),
    );

    const tool = createTavilySearchTool({
      apiKey: "test-key",
      fetch: fetchMock,
    });
    const result = await tool.execute({ query: "Stripe competitors" }, {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.results).toEqual([
        {
          url: "https://example.com/stripe",
          title: "Stripe competitors",
          snippet: "Adyen and PayPal",
          publishedAt: "2024-01-15",
          score: 0.91,
        },
      ]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not invent missing metadata", () => {
    expect(
      normalizeTavilyResults({
        results: [
          {
            url: "https://example.com/plain",
            title: "Plain",
            content: "Snippet only",
          },
        ],
      }),
    ).toEqual([
      {
        url: "https://example.com/plain",
        title: "Plain",
        snippet: "Snippet only",
      },
    ]);
  });

  it("clamps results to the configured limit and skips invalid URLs", () => {
    const results = Array.from({ length: 8 }, (_, index) => ({
      title: `Result ${index + 1}`,
      url: `https://example.com/${index + 1}`,
      content: `Snippet ${index + 1}`,
    }));
    results.splice(1, 0, { title: "Bad", url: "not-a-url", content: "x" });

    const hits = normalizeTavilyResults({ results });

    expect(hits).toHaveLength(MAX_SEARCH_RESULTS_PER_QUERY);
    expect(hits.every((hit) => hit.url.startsWith("https://"))).toBe(true);
  });

  it("retries a retryable HTTP error once the budget allows, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              title: "Recovered",
              url: "https://example.com/recovered",
              content: "ok",
            },
          ],
        }),
      );

    const tool = createTavilySearchTool({
      apiKey: "test-key",
      fetch: fetchMock,
    });
    const result = await tool.execute({ query: "Stripe" }, {});

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "no" }, 401));
    const tool = createTavilySearchTool({
      apiKey: "test-key",
      fetch: fetchMock,
    });
    const result = await tool.execute({ query: "Stripe" }, {});

    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      statusCode: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps timeouts as retryable and stops after the retry budget", async () => {
    const timeout = Object.assign(new Error("The operation was aborted"), {
      name: "TimeoutError",
    });
    const fetchMock = vi.fn().mockRejectedValue(timeout);
    const tool = createTavilySearchTool({
      apiKey: "test-key",
      fetch: fetchMock,
    });
    const result = await tool.execute({ query: "Stripe" }, {});

    expect(result).toMatchObject({
      ok: false,
      retryable: true,
    });
    expect(result.ok === false && result.error).toMatch(/timed out/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails without calling the network when the API key is missing", async () => {
    const fetchMock = vi.fn();
    const tool = createTavilySearchTool({ fetch: fetchMock });
    const result = await tool.execute({ query: "Stripe" }, {});

    expect(result).toEqual({
      ok: false,
      error: "TAVILY_API_KEY is not set",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
