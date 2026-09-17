import { describe, expect, it, vi } from "vitest";
import { MAX_SEARCH_RESULTS_PER_QUERY } from "@/lib/research/limits";
import {
  BRAVE_SEARCH_URL,
  createBraveSearchTool,
  normalizeBraveResults,
} from "@/lib/tools/search/brave";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function webPayload(results: unknown[]) {
  return { web: { results } };
}

describe("Brave search", () => {
  it("returns normalized successful results and sends the Brave request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        webPayload([
          {
            title: "Stripe competitors",
            url: "https://example.com/stripe",
            description: "Adyen and PayPal",
            page_age: "2024-01-15",
          },
        ]),
      ),
    );

    const tool = createBraveSearchTool({
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
        },
      ]);
      expect(result.data.results[0]).not.toHaveProperty("score");
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(requestUrl);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(BRAVE_SEARCH_URL);
    expect(parsed.searchParams.get("q")).toBe("Stripe competitors");
    expect(parsed.searchParams.get("count")).toBe(
      String(MAX_SEARCH_RESULTS_PER_QUERY),
    );
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      "X-Subscription-Token": "test-key",
    });
  });

  it("does not invent missing metadata and ignores non-web results", () => {
    expect(
      normalizeBraveResults({
        news: {
          results: [
            {
              title: "News only",
              url: "https://example.com/news",
              description: "Should be ignored",
            },
          ],
        },
        web: {
          results: [
            {
              url: "https://example.com/plain",
              title: "Plain",
              description: "Snippet only",
            },
          ],
        },
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
      description: `Snippet ${index + 1}`,
    }));
    results.splice(1, 0, { title: "Bad", url: "not-a-url", description: "x" });

    const hits = normalizeBraveResults(webPayload(results));

    expect(hits).toHaveLength(MAX_SEARCH_RESULTS_PER_QUERY);
    expect(hits.every((hit) => hit.url.startsWith("https://"))).toBe(true);
  });

  it("falls back to the URL and an empty snippet when title or description is missing", () => {
    expect(
      normalizeBraveResults(
        webPayload([
          {
            url: "https://example.com/untitled",
          },
        ]),
      ),
    ).toEqual([
      {
        url: "https://example.com/untitled",
        title: "https://example.com/untitled",
        snippet: "",
      },
    ]);
  });

  it("retries a retryable HTTP error once the budget allows, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 503))
      .mockResolvedValueOnce(
        jsonResponse(
          webPayload([
            {
              title: "Recovered",
              url: "https://example.com/recovered",
              description: "ok",
            },
          ]),
        ),
      );

    const tool = createBraveSearchTool({
      apiKey: "test-key",
      fetch: fetchMock,
    });
    const result = await tool.execute({ query: "Stripe" }, {});

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "no" }, 401));
    const tool = createBraveSearchTool({
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

  it("does not retry forbidden responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "no" }, 403));
    const tool = createBraveSearchTool({
      apiKey: "test-key",
      fetch: fetchMock,
    });
    const result = await tool.execute({ query: "Stripe" }, {});

    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      statusCode: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps timeouts as retryable and stops after the retry budget", async () => {
    const timeout = Object.assign(new Error("The operation was aborted"), {
      name: "TimeoutError",
    });
    const fetchMock = vi.fn().mockRejectedValue(timeout);
    const tool = createBraveSearchTool({
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
    const tool = createBraveSearchTool({ fetch: fetchMock });
    const result = await tool.execute({ query: "Stripe" }, {});

    expect(result).toEqual({
      ok: false,
      error: "BRAVE_API_KEY is not set",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
