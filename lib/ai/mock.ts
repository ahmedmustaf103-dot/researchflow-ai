import type { ZodType } from "zod";
import {
  SOURCE_CONTENT_END,
  SOURCE_CONTENT_START,
} from "./prompts/extract";
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

export type MockExtractedFinding = {
  claim: string;
  quote: string;
  relevance: string;
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
  extraction?:
    | { findings: MockExtractedFinding[] }
    | ((input: GenerateObjectInput) => { findings: MockExtractedFinding[] });
  failExtraction?: boolean | ((input: GenerateObjectInput) => boolean);
};

export function defaultExtractionFromPrompt(
  prompt: string,
): { findings: MockExtractedFinding[] } {
  const start = prompt.indexOf(SOURCE_CONTENT_START);
  const end = prompt.indexOf(SOURCE_CONTENT_END);
  const content =
    start >= 0 && end > start
      ? prompt.slice(start + SOURCE_CONTENT_START.length, end).trim()
      : "";

  if (!content) {
    return { findings: [] };
  }

  const quote = content.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!quote) {
    return { findings: [] };
  }

  return {
    findings: [
      {
        claim:
          "The retrieved source contains evidence related to the research question.",
        quote,
        relevance: "The quoted passage appears in the retrieved source.",
      },
    ],
  };
}

export class MockLLMProvider implements LLMProvider {
  readonly id = "mock";
  private readonly plan: MockResearchPlan;
  private readonly extraction?: MockLLMProviderOptions["extraction"];
  private readonly failExtraction?: MockLLMProviderOptions["failExtraction"];

  constructor(options: MockLLMProviderOptions = {}) {
    this.plan = options.plan ?? defaultMockResearchPlan;
    this.extraction = options.extraction;
    this.failExtraction = options.failExtraction;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    return { text: `echo:${input.prompt}` };
  }

  async generateObject<T>(
    input: GenerateObjectInput,
    schema: ZodType<T>,
  ): Promise<GenerateObjectResult<T>> {
    const asPlan = schema.safeParse(this.plan);
    if (asPlan.success) {
      return { object: asPlan.data };
    }

    if (
      this.failExtraction === true ||
      (typeof this.failExtraction === "function" && this.failExtraction(input))
    ) {
      throw new Error("Gemini extraction failed");
    }

    const extraction =
      typeof this.extraction === "function"
        ? this.extraction(input)
        : (this.extraction ?? defaultExtractionFromPrompt(input.prompt));

    return { object: schema.parse(extraction) };
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
