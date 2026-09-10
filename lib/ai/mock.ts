import type { ZodType } from "zod";
import type {
  EmbedInput,
  EmbedResult,
  GenerateObjectInput,
  GenerateObjectResult,
  GenerateTextInput,
  GenerateTextResult,
  GenerateWithToolsInput,
  GenerateWithToolsResult,
  LLMProvider,
  ProviderToolDefinition,
} from "./provider";
export type MockResearchPlan = {
  goal: string;
  dimensions: string[];
  tasks: Array<{
    title: string;
    query: string;
    sortOrder: number;
  }>;
};

export const defaultMockResearchPlan: MockResearchPlan = {
  goal: "Identify the main competitors and compare pricing and features",
  dimensions: ["competitors", "pricing", "features"],
  tasks: [
    {
      title: "Identify competitors",
      query: "Identify the top competitors related to the research question",
      sortOrder: 1,
    },
    {
      title: "Compare pricing and features",
      query: "Compare pricing and features",
      sortOrder: 2,
    },
    {
      title: "Summarise strengths and weaknesses",
      query: "Summarise strengths, weaknesses, and target market",
      sortOrder: 3,
    },
  ],
};

export type MockLLMProviderOptions = {
  plan?: MockResearchPlan;
};

export class MockLLMProvider implements LLMProvider {
  readonly id = "mock";
  private readonly plan: MockResearchPlan;

  constructor(options: MockLLMProviderOptions = {}) {
    this.plan = options.plan ?? defaultMockResearchPlan;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    return { text: `echo:${input.prompt}` };
  }

  async generateObject<T>(
    _input: GenerateObjectInput,
    schema: ZodType<T>,
  ): Promise<GenerateObjectResult<T>> {
    return { object: schema.parse(this.plan) };
  }

  async generateWithTools(
    input: GenerateWithToolsInput,
    tools: ProviderToolDefinition[],
  ): Promise<GenerateWithToolsResult> {
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

  async embed(input: EmbedInput): Promise<EmbedResult> {
    return {
      embeddings: input.texts.map((text) => [text.length, 0, 1]),
    };
  }
}

export function createMockLLMProvider(
  options: MockLLMProviderOptions = {},
): MockLLMProvider {
  return new MockLLMProvider(options);
}
