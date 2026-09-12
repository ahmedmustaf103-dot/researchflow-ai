export async function withRetries<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries: number;
    isRetryable: (error: unknown) => boolean;
  },
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const canRetry =
        attempt < options.maxRetries && options.isRetryable(error);
      if (!canRetry) {
        throw error;
      }
    }
  }

  throw lastError;
}
