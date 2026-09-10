import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  LLMConfigError,
  LLMInvalidOutputError,
  LLMProviderError,
} from "@/lib/ai/errors";
import { GeminiProvider, type GeminiSdk } from "@/lib/ai/gemini";

const planSchema = z.object({
  goal: z.string(),
  dimensions: z.array(z.string()),
  tasks: z.array(
    z.object({
      title: z.string(),
      query: z.string(),
      sortOrder: z.number(),
    }),
  ),
});

const validPlan = {
  goal: "Compare Stripe competitors",
  dimensions: ["pricing"],
  tasks: [
    {
      title: "Identify competitors",
      query: "Stripe competitors",
      sortOrder: 1,
    },
  ],
};

function createSdk(overrides: Partial<GeminiSdk> = {}): GeminiSdk {
  return {
    generateText: vi.fn(),
    generateObject: vi.fn(),
    ...overrides,
  } as unknown as GeminiSdk;
}

function apiError(statusCode: number, retryable = true) {
  return new APICallError({
    message: `HTTP ${statusCode}`,
    url: "https://generativelanguage.googleapis.com/v1beta",
    requestBodyValues: {},
    statusCode,
    isRetryable: retryable,
  });
}

describe("GeminiProvider", () => {
  it("returns successful structured output", async () => {
    const generateObject = vi.fn().mockResolvedValue({ object: validPlan });
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
      sdk: createSdk({ generateObject }),
    });

    const result = await provider.generateObject(
      { prompt: "Plan this research" },
      planSchema,
    );

    expect(result.object).toEqual(validPlan);
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it("maps API errors", async () => {
    const provider = new GeminiProvider({
      apiKey: "test-key",
      sdk: createSdk({
        generateObject: vi.fn().mockRejectedValue(apiError(400, false)),
      }),
    });

    await expect(
      provider.generateObject({ prompt: "Plan this research" }, planSchema),
    ).rejects.toMatchObject({
      name: "LLMProviderError",
      code: "api_error",
      statusCode: 400,
    });
  });

  it("maps rate limits and server errors", async () => {
    const rateLimited = new GeminiProvider({
      apiKey: "test-key",
      sdk: createSdk({
        generateObject: vi.fn().mockRejectedValue(apiError(429)),
      }),
    });
    const serverError = new GeminiProvider({
      apiKey: "test-key",
      sdk: createSdk({
        generateText: vi.fn().mockRejectedValue(apiError(503)),
      }),
    });

    await expect(
      rateLimited.generateObject({ prompt: "Plan this research" }, planSchema),
    ).rejects.toMatchObject({
      name: "LLMProviderError",
      code: "rate_limit",
      retryable: true,
    });
    await expect(
      serverError.generateText({ prompt: "hello" }),
    ).rejects.toMatchObject({
      name: "LLMProviderError",
      code: "server_error",
      retryable: true,
    });
  });

  it("retries a retryable error once and then succeeds", async () => {
    const generateObject = vi
      .fn()
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce({ object: validPlan });
    const provider = new GeminiProvider({
      apiKey: "test-key",
      sdk: createSdk({ generateObject }),
    });

    const result = await provider.generateObject(
      { prompt: "Plan this research" },
      planSchema,
    );

    expect(result.object.goal).toBe(validPlan.goal);
    expect(generateObject).toHaveBeenCalledTimes(2);
  });

  it("fails after a single retry", async () => {
    const generateObject = vi.fn().mockRejectedValue(apiError(503));
    const provider = new GeminiProvider({
      apiKey: "test-key",
      sdk: createSdk({ generateObject }),
    });

    await expect(
      provider.generateObject({ prompt: "Plan this research" }, planSchema),
    ).rejects.toBeInstanceOf(LLMProviderError);
    expect(generateObject).toHaveBeenCalledTimes(2);
  });

  it("retries invalid structured output once, then throws a typed error", async () => {
    const generateObject = vi.fn().mockResolvedValue({ object: { goal: "" } });
    const provider = new GeminiProvider({
      apiKey: "test-key",
      sdk: createSdk({ generateObject }),
    });

    await expect(
      provider.generateObject({ prompt: "Plan this research" }, planSchema),
    ).rejects.toBeInstanceOf(LLMInvalidOutputError);
    expect(generateObject).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable API error", async () => {
    const generateObject = vi.fn().mockRejectedValue(apiError(400, false));
    const provider = new GeminiProvider({
      apiKey: "test-key",
      sdk: createSdk({ generateObject }),
    });

    await expect(
      provider.generateObject({ prompt: "Plan this research" }, planSchema),
    ).rejects.toBeInstanceOf(LLMProviderError);
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it("rejects missing configuration", async () => {
    const generateObject = vi.fn();
    const provider = new GeminiProvider({
      sdk: createSdk({ generateObject }),
    });

    await expect(
      provider.generateObject({ prompt: "Plan this research" }, planSchema),
    ).rejects.toBeInstanceOf(LLMConfigError);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("does not implement embeddings or tool calling in Phase 2A", async () => {
    const provider = new GeminiProvider({ apiKey: "test-key" });

    await expect(provider.embed({ texts: ["x"] })).rejects.toThrow(
      /not implemented in Phase 2A/,
    );
    await expect(
      provider.generateWithTools({ prompt: "search" }, []),
    ).rejects.toThrow(/not implemented in Phase 2A/);
  });
});
