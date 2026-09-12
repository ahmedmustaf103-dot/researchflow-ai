import { describe, expect, it, vi } from "vitest";
import { MAX_PAGE_CHARACTERS } from "@/lib/research/limits";
import {
  createJinaFetchPageTool,
  jinaReaderUrl,
  truncatePageContent,
} from "@/lib/tools/fetch-page/jina";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Jina retrieval", () => {
  it("retrieves readable page content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          title: "Stripe pricing",
          content: "2.9% + 30c",
          url: "https://stripe.com/pricing",
        },
      }),
    );

    const tool = createJinaFetchPageTool({ fetch: fetchMock });
    const result = await tool.execute(
      { url: "https://stripe.com/pricing" },
      {},
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        url: "https://stripe.com/pricing",
        title: "Stripe pricing",
        content: "2.9% + 30c",
        httpStatus: 200,
      });
    }
    expect(fetchMock).toHaveBeenCalledWith(
      jinaReaderUrl("https://stripe.com/pricing"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("truncates retained content to 12,000 characters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          title: "Long page",
          content: "x".repeat(MAX_PAGE_CHARACTERS + 250),
        },
      }),
    );
    const tool = createJinaFetchPageTool({ fetch: fetchMock });
    const result = await tool.execute({ url: "https://example.com/long" }, {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.content).toHaveLength(MAX_PAGE_CHARACTERS);
      expect(result.data.content).toBe(
        truncatePageContent("x".repeat(MAX_PAGE_CHARACTERS + 250)),
      );
    }
  });

  it("retries a retryable HTTP error once, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "busy" }, 429))
      .mockResolvedValueOnce(
        jsonResponse({
          data: { title: "Recovered", content: "ok" },
        }),
      );
    const tool = createJinaFetchPageTool({ fetch: fetchMock });
    const result = await tool.execute({ url: "https://example.com" }, {});

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry invalid requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "bad" }, 400));
    const tool = createJinaFetchPageTool({ fetch: fetchMock });
    const result = await tool.execute({ url: "https://example.com" }, {});

    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      statusCode: 400,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps timeouts as retryable and stops after one retry", async () => {
    const timeout = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    const fetchMock = vi.fn().mockRejectedValue(timeout);
    const tool = createJinaFetchPageTool({ fetch: fetchMock });
    const result = await tool.execute({ url: "https://example.com" }, {});

    expect(result).toMatchObject({
      ok: false,
      retryable: true,
    });
    expect(result.ok === false && result.error).toMatch(/timed out/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
