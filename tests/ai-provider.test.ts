import { describe, expect, it } from "vitest";
import { z } from "zod";
import type {
  EmbedInput,
  GenerateObjectInput,
  GenerateTextInput,
  GenerateWithToolsInput,
  LLMProvider,
  ProviderToolDefinition,
} from "@/lib/ai";

class MockLLMProvider implements LLMProvider {
  readonly id = "mock";

  async generateText(input: GenerateTextInput) {
    return { text: `echo:${input.prompt}` };
  }

  async generateObject<T>(input: GenerateObjectInput, schema: z.ZodType<T>) {
    const parsed = schema.parse({
      topic: input.prompt,
      confidence: 0.9,
    });

    return { object: parsed };
  }

  async generateWithTools(
    input: GenerateWithToolsInput,
    tools: ProviderToolDefinition[],
  ) {
    const [tool] = tools;

    if (!tool) {
      return { text: input.prompt, toolCalls: [] };
    }

    return {
      toolCalls: [
        {
          name: tool.name,
          arguments: { query: input.prompt },
        },
      ],
    };
  }

  async embed(input: EmbedInput) {
    return {
      embeddings: input.texts.map((text) => [text.length, 0, 1]),
    };
  }
}

const findingSchema = z.object({
  topic: z.string(),
  confidence: z.number().min(0).max(1),
});

describe("LLMProvider mock", () => {
  const provider: LLMProvider = new MockLLMProvider();

  it("can be used through the LLMProvider interface", () => {
    expect(provider.id).toBe("mock");
  });

  it("returns generated text from the prompt", async () => {
    const result = await provider.generateText({ prompt: "competitors of Stripe" });

    expect(result.text).toBe("echo:competitors of Stripe");
  });

  it("validates structured output against the provided schema", async () => {
    const result = await provider.generateObject(
      { prompt: "Stripe competitors" },
      findingSchema,
    );

    expect(result.object.topic).toBe("Stripe competitors");
    expect(result.object.confidence).toBe(0.9);
  });

  it("rejects structured output that does not match the schema", async () => {
    const strictSchema = z.object({
      companies: z.array(z.string()).min(1),
    });

    await expect(
      provider.generateObject({ prompt: "Stripe competitors" }, strictSchema),
    ).rejects.toThrow();
  });

  it("selects a registered tool name when tools are provided", async () => {
    const result = await provider.generateWithTools(
      { prompt: "Stripe pricing" },
      [{ name: "search", description: "Web search", inputSchema: {} }],
    );

    expect(result.toolCalls).toEqual([
      { name: "search", arguments: { query: "Stripe pricing" } },
    ]);
  });

  it("embeds each input text", async () => {
    const result = await provider.embed({ texts: ["alpha", "beta"] });

    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0]?.[0]).toBe(5);
  });
});
