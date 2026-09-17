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

export const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

export type BraveSearchToolOptions = {
  apiKey?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxResults?: number;
};

type BraveWebResult = {
  title?: unknown;
  url?: unknown;
  description?: unknown;
  page_age?: unknown;
};

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isUsablePageAge(value: unknown): string | undefined {
  return asNonEmptyString(value);
}

export function braveSearchRequestUrl(
  query: string,
  count = MAX_SEARCH_RESULTS_PER_QUERY,
): string {
  const url = new URL(BRAVE_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  return url.toString();
}

export function normalizeBraveResults(
  raw: unknown,
  maxResults = MAX_SEARCH_RESULTS_PER_QUERY,
): SearchHit[] {
  const payload = raw && typeof raw === "object" ? (raw as { web?: unknown }) : {};
  const web = payload.web && typeof payload.web === "object"
    ? (payload.web as { results?: unknown })
    : {};
  const results = Array.isArray(web.results) ? web.results : [];
  const hits: SearchHit[] = [];

  for (const item of results) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const result = item as BraveWebResult;
    const url = asNonEmptyString(result.url);
    if (!url) {
      continue;
    }

    try {
      new URL(url);
    } catch {
      continue;
    }

    const publishedAt = isUsablePageAge(result.page_age);

    hits.push({
      url,
      title: asNonEmptyString(result.title) ?? url,
      snippet: asNonEmptyString(result.description) ?? "",
      ...(publishedAt ? { publishedAt } : {}),
    });

    if (hits.length >= maxResults) {
      break;
    }
  }

  return hits;
}

function safeHttpMessage(status: number): string {
  return `Brave search failed (${status})`;
}

export function createBraveSearchTool(
  options: BraveSearchToolOptions = {},
): InternalTool<SearchInput, SearchOutput> {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS;
  const maxResults = options.maxResults ?? MAX_SEARCH_RESULTS_PER_QUERY;

  return {
    source: "internal",
    name: "search",
    description: "Search the web with Brave Search and return normalized results.",
    inputSchema: searchInputSchema,
    async execute(input): Promise<ToolResult<SearchOutput>> {
      const apiKey = options.apiKey?.trim();
      if (!apiKey) {
        return {
          ok: false,
          error: "BRAVE_API_KEY is not set",
          retryable: false,
        };
      }

      try {
        const data = await withRetries(
          async () => {
            let response: Response;
            try {
              response = await fetchFn(
                braveSearchRequestUrl(input.query.trim(), maxResults),
                {
                  method: "GET",
                  headers: {
                    Accept: "application/json",
                    "X-Subscription-Token": apiKey,
                  },
                  signal: AbortSignal.timeout(timeoutMs),
                },
              );
            } catch (error) {
              throw mapUnknownToolError(error, "Brave search request failed");
            }

            if (!response.ok) {
              await response.text().catch(() => "");
              throw toolErrorFromHttpStatus(
                response.status,
                safeHttpMessage(response.status),
              );
            }

            try {
              return (await response.json()) as unknown;
            } catch (error) {
              throw new ToolError("Brave returned malformed search results", {
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
            results: normalizeBraveResults(data, maxResults),
          },
        };
      } catch (error) {
        const mapped = mapUnknownToolError(error, "Brave search failed");
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
