import {
  APICallError,
  generateObject as sdkGenerateObject,
  generateText as sdkGenerateText,
  LoadAPIKeyError,
  NoObjectGeneratedError,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { ZodError, type ZodType } from "zod";
import {
  LLMConfigError,
  LLMInvalidOutputError,
  LLMProviderError,
} from "./errors";
import type {
  EmbedInput,
  GenerateObjectInput,
  GenerateObjectResult,
  GenerateTextInput,
  GenerateTextResult,
  GenerateWithToolsInput,
  GenerateWithToolsResult,
  LLMProvider,
  ProviderToolDefinition,
} from "./provider";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_GEMINI_TIMEOUT_MS = 30_000;
/** Default wait before retrying a 429 when Retry-After is absent. */
export const DEFAULT_GEMINI_RATE_LIMIT_BACKOFF_MS = 1_000;
/** Cap Retry-After / backoff so a single call cannot stall forever. */
export const MAX_GEMINI_RATE_LIMIT_BACKOFF_MS = 5_000;

export type GeminiSdk = {
  generateText: typeof sdkGenerateText;
  generateObject: typeof sdkGenerateObject;
};

export type GeminiProviderOptions = {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  /** Injectable delay for tests; defaults to setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  rateLimitBackoffMs?: number;
  maxRateLimitBackoffMs?: number;
  sdk?: GeminiSdk;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbortOrTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    error.message.toLowerCase().includes("timeout") ||
    error.message.toLowerCase().includes("aborted")
  );
}

function isInvalidStructuredOutput(error: unknown): boolean {
  return (
    NoObjectGeneratedError.isInstance(error) ||
    error instanceof ZodError ||
    error instanceof LLMInvalidOutputError
  );
}

function isRateLimitError(error: unknown): boolean {
  return APICallError.isInstance(error) && error.statusCode === 429;
}

/**
 * Read Retry-After when present (seconds or HTTP-date).
 * Returns undefined when missing/unusable.
 */
export function parseRetryAfterMs(error: unknown): number | undefined {
  if (!APICallError.isInstance(error)) {
    return undefined;
  }

  const headers = error.responseHeaders;
  if (!headers) {
    return undefined;
  }

  const raw =
    headers["retry-after"] ??
    headers["Retry-After"] ??
    headers["RETRY-AFTER"];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return undefined;
  }

  const trimmed = raw.trim();
  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1_000);
  }

  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return undefined;
}

export function rateLimitBackoffMs(
  error: unknown,
  options?: {
    defaultMs?: number;
    maxMs?: number;
  },
): number {
  const defaultMs = options?.defaultMs ?? DEFAULT_GEMINI_RATE_LIMIT_BACKOFF_MS;
  const maxMs = options?.maxMs ?? MAX_GEMINI_RATE_LIMIT_BACKOFF_MS;
  const fromHeader = parseRetryAfterMs(error);
  const chosen =
    fromHeader !== undefined && Number.isFinite(fromHeader)
      ? fromHeader
      : defaultMs;
  return Math.min(Math.max(0, chosen), maxMs);
}

function isRetryableError(error: unknown, retryInvalidOutput: boolean): boolean {
  if (retryInvalidOutput && isInvalidStructuredOutput(error)) {
    return true;
  }

  if (APICallError.isInstance(error)) {
    return (
      error.isRetryable ||
      error.statusCode === 429 ||
      (error.statusCode !== undefined && error.statusCode >= 500)
    );
  }

  return isAbortOrTimeout(error);
}

function mapGeminiError(error: unknown): never {
  if (
    error instanceof LLMConfigError ||
    error instanceof LLMInvalidOutputError ||
    error instanceof LLMProviderError
  ) {
    throw error;
  }

  if (LoadAPIKeyError.isInstance(error)) {
    throw new LLMConfigError("GEMINI_API_KEY is not set");
  }

  if (isInvalidStructuredOutput(error)) {
    throw new LLMInvalidOutputError(
      "Gemini returned invalid structured output",
      { cause: error },
    );
  }

  if (isAbortOrTimeout(error)) {
    throw new LLMProviderError("Gemini request timed out", {
      code: "timeout",
      retryable: true,
      cause: error,
    });
  }

  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) {
      throw new LLMProviderError("Gemini rate limit exceeded", {
        code: "rate_limit",
        retryable: true,
        statusCode: 429,
        cause: error,
      });
    }

    if (error.statusCode !== undefined && error.statusCode >= 500) {
      throw new LLMProviderError("Gemini server error", {
        code: "server_error",
        retryable: true,
        statusCode: error.statusCode,
        cause: error,
      });
    }

    throw new LLMProviderError(error.message || "Gemini API error", {
      code: "api_error",
      retryable: error.isRetryable,
      statusCode: error.statusCode,
      cause: error,
    });
  }

  const message = error instanceof Error ? error.message : "Unknown Gemini error";
  throw new LLMProviderError(message, {
    code: "unknown",
    retryable: false,
    cause: error,
  });
}

export class GeminiProvider implements LLMProvider {
  readonly id = "gemini";
  readonly model: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly rateLimitBackoffMs: number;
  private readonly maxRateLimitBackoffMs: number;
  private readonly sdk: GeminiSdk;

  constructor(options: GeminiProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_GEMINI_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS;
    this.sleep = options.sleep ?? defaultSleep;
    this.rateLimitBackoffMs =
      options.rateLimitBackoffMs ?? DEFAULT_GEMINI_RATE_LIMIT_BACKOFF_MS;
    this.maxRateLimitBackoffMs =
      options.maxRateLimitBackoffMs ?? MAX_GEMINI_RATE_LIMIT_BACKOFF_MS;
    this.sdk = options.sdk ?? {
      generateText: sdkGenerateText,
      generateObject: sdkGenerateObject,
    };
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    this.requireApiKey();

    const text = await this.callWithRetry(async () => {
      const result = await this.sdk.generateText({
        model: this.languageModel(),
        system: input.system,
        prompt: input.prompt,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(this.timeoutMs),
      });

      return result.text;
    });

    return { text };
  }

  async generateObject<T>(
    input: GenerateObjectInput,
    schema: ZodType<T>,
  ): Promise<GenerateObjectResult<T>> {
    this.requireApiKey();

    const object = await this.callWithRetry(
      async () => {
        const result = await this.sdk.generateObject({
          model: this.languageModel(),
          schema,
          system: input.system,
          prompt: input.prompt,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(this.timeoutMs),
        });

        return schema.parse(result.object);
      },
      { retryInvalidOutput: true },
    );

    return { object };
  }

  async generateWithTools(
    input: GenerateWithToolsInput,
    tools: ProviderToolDefinition[],
  ): Promise<GenerateWithToolsResult> {
    void input;
    void tools;
    throw new LLMProviderError(
      "generateWithTools is not implemented in Phase 2A",
      { code: "unknown", retryable: false },
    );
  }

  async embed(input: EmbedInput): Promise<never> {
    void input;
    throw new LLMProviderError("embed is not implemented in Phase 2A", {
      code: "unknown",
      retryable: false,
    });
  }

  private requireApiKey(): void {
    if (!this.apiKey) {
      throw new LLMConfigError("GEMINI_API_KEY is not set");
    }
  }

  private languageModel() {
    return createGoogleGenerativeAI({ apiKey: this.apiKey })(this.model);
  }

  private async callWithRetry<T>(
    operation: () => Promise<T>,
    options?: { retryInvalidOutput?: boolean },
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableError(error, options?.retryInvalidOutput === true)) {
        mapGeminiError(error);
      }

      // 429: never hammer immediately — wait Retry-After or a short bounded backoff.
      if (isRateLimitError(error)) {
        await this.sleep(
          rateLimitBackoffMs(error, {
            defaultMs: this.rateLimitBackoffMs,
            maxMs: this.maxRateLimitBackoffMs,
          }),
        );
      }

      try {
        return await operation();
      } catch (retryError) {
        if (options?.retryInvalidOutput && isInvalidStructuredOutput(retryError)) {
          throw new LLMInvalidOutputError(
            "Gemini returned invalid structured output",
            { cause: retryError },
          );
        }

        mapGeminiError(retryError);
      }
    }
  }
}

export function createGeminiProvider(
  options: GeminiProviderOptions = {},
): GeminiProvider {
  return new GeminiProvider({
    apiKey: options.apiKey ?? readOptionalEnv("GEMINI_API_KEY"),
    model: options.model ?? readOptionalEnv("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL,
    timeoutMs: options.timeoutMs,
    sleep: options.sleep,
    rateLimitBackoffMs: options.rateLimitBackoffMs,
    maxRateLimitBackoffMs: options.maxRateLimitBackoffMs,
    sdk: options.sdk,
  });
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}
