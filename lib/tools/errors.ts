export type ToolErrorCode =
  | "config"
  | "timeout"
  | "rate_limit"
  | "server_error"
  | "auth"
  | "invalid_request"
  | "network"
  | "unknown";

export class ToolError extends Error {
  readonly code: ToolErrorCode;
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(
    message: string,
    options?: {
      code?: ToolErrorCode;
      retryable?: boolean;
      statusCode?: number;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "ToolError";
    this.code = options?.code ?? "unknown";
    this.retryable = options?.retryable ?? false;
    this.statusCode = options?.statusCode;
  }
}

export function isAbortOrTimeout(error: unknown): boolean {
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

export function isRetryableToolError(error: unknown): boolean {
  if (error instanceof ToolError) {
    return error.retryable;
  }

  if (isAbortOrTimeout(error)) {
    return true;
  }

  return error instanceof TypeError;
}

export function toolErrorFromHttpStatus(
  statusCode: number,
  message: string,
): ToolError {
  if (statusCode === 429) {
    return new ToolError(message, {
      code: "rate_limit",
      retryable: true,
      statusCode,
    });
  }

  if (statusCode === 401 || statusCode === 403) {
    return new ToolError(message, {
      code: "auth",
      retryable: false,
      statusCode,
    });
  }

  if (statusCode === 400 || statusCode === 404 || statusCode === 422) {
    return new ToolError(message, {
      code: "invalid_request",
      retryable: false,
      statusCode,
    });
  }

  if (statusCode >= 500) {
    return new ToolError(message, {
      code: "server_error",
      retryable: true,
      statusCode,
    });
  }

  return new ToolError(message, {
    code: "unknown",
    retryable: false,
    statusCode,
  });
}

export function mapUnknownToolError(error: unknown, fallback: string): ToolError {
  if (error instanceof ToolError) {
    return error;
  }

  if (isAbortOrTimeout(error)) {
    return new ToolError("Request timed out", {
      code: "timeout",
      retryable: true,
      cause: error,
    });
  }

  if (error instanceof TypeError) {
    return new ToolError("Network error", {
      code: "network",
      retryable: true,
      cause: error,
    });
  }

  const message = error instanceof Error ? error.message : fallback;
  return new ToolError(message, {
    code: "unknown",
    retryable: false,
    cause: error,
  });
}
