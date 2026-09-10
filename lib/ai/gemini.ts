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

export type GeminiSdk = {
  generateText: typeof sdkGenerateText;
  generateObject: typeof sdkGenerateObject;
};

export type GeminiProviderOptions = {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  sdk?: GeminiSdk;
};

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
  private readonly sdk: GeminiSdk;

  constructor(options: GeminiProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_GEMINI_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS;
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
    sdk: options.sdk,
  });
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}
