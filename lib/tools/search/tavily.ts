import {
  MAX_SEARCH_RESULTS_PER_QUERY,
  MAX_SEARCH_RETRIES,
  SEARCH_TIMEOUT_MS,
} from "@/lib/research/limits";
import type { SearchHit } from "@/lib/research/types";
import {
  isRetryableToolError,
  mapUnknownToolError,
  ToolError,
  toolErrorFromHttpStatus,
} from "@/lib/tools/errors";
import { withRetries } from "@/lib/tools/retry";
import type { InternalTool, ToolResult } from "@/lib/tools/types";
import { searchInputSchema, type SearchInput, type SearchOutput } from "../search";

export const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

export type TavilySearchToolOptions = {
  apiKey?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxResults?: number;
};

type TavilyResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  published_date?: unknown;
  publishedDate?: unknown;
  score?: unknown;
};

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeTavilyResults(
  raw: unknown,
  maxResults = MAX_SEARCH_RESULTS_PER_QUERY,
): SearchHit[] {
  const payload = raw && typeof raw === "object" ? (raw as { results?: unknown }) : {};
  const results = Array.isArray(payload.results) ? payload.results : [];
  const hits: SearchHit[] = [];

  for (const item of results) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const result = item as TavilyResult;
    const url = asNonEmptyString(result.url);
    if (!url) {
      continue;
    }

    try {
      new URL(url);
    } catch {
      continue;
    }

    const publishedAt =
      asNonEmptyString(result.published_date) ??
      asNonEmptyString(result.publishedDate);
    const score = asFiniteNumber(result.score);

    hits.push({
      url,
      title: asNonEmptyString(result.title) ?? url,
      snippet: asNonEmptyString(result.content) ?? "",
      ...(publishedAt ? { publishedAt } : {}),
      ...(score !== undefined ? { score } : {}),
    });

    if (hits.length >= maxResults) {
      break;
    }
  }

  return hits;
}

function safeHttpMessage(status: number, body: string): string {
  const compact = body.replace(/\s+/g, " ").trim().slice(0, 180);
  return compact
    ? `Tavily search failed (${status})`
    : `Tavily search failed (${status})`;
}

export function createTavilySearchTool(
  options: TavilySearchToolOptions = {},
): InternalTool<SearchInput, SearchOutput> {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS;
  const maxResults = options.maxResults ?? MAX_SEARCH_RESULTS_PER_QUERY;

  return {
    source: "internal",
    name: "search",
    description: "Search the web with Tavily and return normalized results.",
    inputSchema: searchInputSchema,
    async execute(input): Promise<ToolResult<SearchOutput>> {
      const apiKey = options.apiKey?.trim();
      if (!apiKey) {
        return {
          ok: false,
          error: "TAVILY_API_KEY is not set",
          retryable: false,
        };
      }

      try {
        const data = await withRetries(
          async () => {
            let response: Response;
            try {
              response = await fetchFn(TAVILY_SEARCH_URL, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  query: input.query.trim(),
                  max_results: maxResults,
                  search_depth: "basic",
                  include_answer: false,
                }),
                signal: AbortSignal.timeout(timeoutMs),
              });
            } catch (error) {
              throw mapUnknownToolError(error, "Tavily search request failed");
            }

            if (!response.ok) {
              const body = await response.text().catch(() => "");
              throw toolErrorFromHttpStatus(
                response.status,
                safeHttpMessage(response.status, body),
              );
            }

            try {
              return (await response.json()) as unknown;
            } catch (error) {
              throw new ToolError("Tavily returned malformed search results", {
                code: "invalid_request",
                retryable: false,
                cause: error,
              });
            }
          },
          {
            maxRetries: MAX_SEARCH_RETRIES,
            isRetryable: isRetryableToolError,
          },
        );

        return {
          ok: true,
          data: {
            results: normalizeTavilyResults(data, maxResults),
          },
        };
      } catch (error) {
        const mapped = mapUnknownToolError(error, "Tavily search failed");
        return {
          ok: false,
          error: mapped.message,
          retryable: mapped.retryable,
          statusCode: mapped.statusCode,
        };
      }
    },
  };
}
