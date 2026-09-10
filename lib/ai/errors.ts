export type LLMErrorCode =
  | "config"
  | "timeout"
  | "rate_limit"
  | "server_error"
  | "api_error"
  | "invalid_output"
  | "unknown";

export class LLMConfigError extends Error {
  readonly code = "config" as const;

  constructor(message: string) {
    super(message);
    this.name = "LLMConfigError";
  }
}

export class LLMInvalidOutputError extends Error {
  readonly code = "invalid_output" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LLMInvalidOutputError";
  }
}

export class LLMProviderError extends Error {
  readonly code: LLMErrorCode;
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(
    message: string,
    options?: {
      code?: LLMErrorCode;
      retryable?: boolean;
      statusCode?: number;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "LLMProviderError";
    this.code = options?.code ?? "api_error";
    this.retryable = options?.retryable ?? false;
    this.statusCode = options?.statusCode;
  }
}
