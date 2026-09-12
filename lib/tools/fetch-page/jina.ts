import {
  FETCH_TIMEOUT_MS,
  MAX_FETCH_RETRIES,
  MAX_PAGE_CHARACTERS,
} from "@/lib/research/limits";
import type { FetchedPage } from "@/lib/research/types";
import {
  isRetryableToolError,
  mapUnknownToolError,
  ToolError,
  toolErrorFromHttpStatus,
} from "@/lib/tools/errors";
import { withRetries } from "@/lib/tools/retry";
import type { InternalTool, ToolResult } from "@/lib/tools/types";
import { fetchPageInputSchema, type FetchPageInput } from "../fetch-page";

export const JINA_READER_ORIGIN = "https://r.jina.ai";

export type JinaFetchPageToolOptions = {
  apiKey?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxCharacters?: number;
};

export function jinaReaderUrl(url: string): string {
  return `${JINA_READER_ORIGIN}/${encodeURIComponent(url)}`;
}

export function truncatePageContent(
  content: string,
  maxCharacters = MAX_PAGE_CHARACTERS,
): string {
  if (content.length <= maxCharacters) {
    return content;
  }

  return content.slice(0, maxCharacters);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function parseJinaReaderPayload(raw: unknown, fallbackUrl: string): {
  title: string;
  content: string;
} {
  if (typeof raw === "string") {
    return parseJinaText(raw, fallbackUrl);
  }

  if (!raw || typeof raw !== "object") {
    return { title: fallbackUrl, content: "" };
  }

  const record = raw as Record<string, unknown>;
  const data =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : record;

  const title = asNonEmptyString(data.title) ?? fallbackUrl;
  const content = typeof data.content === "string" ? data.content : "";

  return { title, content };
}

function parseJinaText(text: string, fallbackUrl: string): {
  title: string;
  content: string;
} {
  const titleMatch = text.match(/^Title:\s*(.+)$/m);
  return {
    title: titleMatch?.[1]?.trim() || fallbackUrl,
    content: text,
  };
}

export function createJinaFetchPageTool(
  options: JinaFetchPageToolOptions = {},
): InternalTool<FetchPageInput, FetchedPage> {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxCharacters = options.maxCharacters ?? MAX_PAGE_CHARACTERS;

  return {
    source: "internal",
    name: "fetch_page",
    description: "Retrieve readable page content with Jina Reader.",
    inputSchema: fetchPageInputSchema,
    async execute(input): Promise<ToolResult<FetchedPage>> {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      const apiKey = options.apiKey?.trim();
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      try {
        const page = await withRetries(
          async () => {
            let response: Response;
            try {
              response = await fetchFn(jinaReaderUrl(input.url), {
                method: "GET",
                headers,
                signal: AbortSignal.timeout(timeoutMs),
              });
            } catch (error) {
              throw mapUnknownToolError(error, "Jina retrieval request failed");
            }

            if (!response.ok) {
              throw toolErrorFromHttpStatus(
                response.status,
                `Jina retrieval failed (${response.status})`,
              );
            }

            const contentType = response.headers.get("content-type") ?? "";
            let parsed: { title: string; content: string };

            if (contentType.includes("application/json")) {
              try {
                parsed = parseJinaReaderPayload(await response.json(), input.url);
              } catch (error) {
                throw new ToolError("Jina returned malformed page content", {
                  code: "invalid_request",
                  retryable: false,
                  cause: error,
                });
              }
            } else {
              parsed = parseJinaReaderPayload(await response.text(), input.url);
            }

            return {
              url: input.url,
              title: parsed.title,
              content: truncatePageContent(parsed.content, maxCharacters),
              httpStatus: response.status,
            } satisfies FetchedPage;
          },
          {
            maxRetries: MAX_FETCH_RETRIES,
            isRetryable: isRetryableToolError,
          },
        );

        return { ok: true, data: page };
      } catch (error) {
        const mapped = mapUnknownToolError(error, "Jina retrieval failed");
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
