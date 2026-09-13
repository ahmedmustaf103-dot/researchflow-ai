import type { ZodType } from "zod";
import { ANALYSE_SYSTEM_PROMPT } from "./prompts/analyse";
import {
  SOURCE_CONTENT_END,
  SOURCE_CONTENT_START,
} from "./prompts/extract";
import { REPORT_SYSTEM_PROMPT } from "./prompts/report";
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

export type MockAnalysis = {
  summary: string;
  comparisons: Array<{ dimension: string; points: string[] }>;
  similarities: string[];
  differences: string[];
  gaps: string[];
  uncertainties: string[];
  conflicts: Array<{ topic: string; statements: string[] }>;
};

export type MockReport = {
  title: string;
  executiveSummary: string;
  scope: string;
  keyFindings: Array<{ text: string; sourceIds: string[] }>;
  comparisons: Array<{
    dimension: string;
    points: string[];
    sourceIds: string[];
  }>;
  strengthsWeaknesses: Array<{
    subject: string;
    strengths: string[];
    weaknesses: string[];
    sourceIds: string[];
  }>;
  gaps: string[];
  uncertainties: string[];
  conflicts: Array<{
    topic: string;
    statements: string[];
    sourceIds: string[];
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
  extraction?:
    | { findings: MockExtractedFinding[] }
    | ((input: GenerateObjectInput) => { findings: MockExtractedFinding[] });
  analysis?: MockAnalysis | ((input: GenerateObjectInput) => MockAnalysis);
  report?: MockReport | ((input: GenerateObjectInput) => MockReport);
  failExtraction?: boolean | ((input: GenerateObjectInput) => boolean);
  failAnalysis?: boolean | ((input: GenerateObjectInput) => boolean);
  failReport?: boolean | ((input: GenerateObjectInput) => boolean);
};

function shouldFail(
  flag: boolean | ((input: GenerateObjectInput) => boolean) | undefined,
  input: GenerateObjectInput,
): boolean {
  return flag === true || (typeof flag === "function" && flag(input));
}

function sourceRefsFromPrompt(prompt: string): string[] {
  return [...new Set([...prompt.matchAll(/\bS\d+\b/g)].map((match) => match[0]))];
}

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

export function defaultAnalysisFromPrompt(prompt: string): MockAnalysis {
  const hasFindings = prompt.includes("Finding 1");
  return {
    summary: hasFindings
      ? "The supplied findings provide limited evidence for the research question."
      : "No extracted findings were available to analyse.",
    comparisons: [],
    similarities: [],
    differences: [],
    gaps: hasFindings ? [] : ["The supplied evidence set is empty."],
    uncertainties: [],
    conflicts: [],
  };
}

export function defaultReportFromPrompt(prompt: string): MockReport {
  const refs = sourceRefsFromPrompt(prompt);
  return {
    title: "Research report",
    executiveSummary:
      "A citation-backed summary of the supplied analysis and findings.",
    scope: "This report is limited to the supplied findings and sources.",
    keyFindings: refs.slice(0, 3).map((ref) => ({
      text: "Evidence from a retrieved source supports the research question.",
      sourceIds: [ref],
    })),
    comparisons: [],
    strengthsWeaknesses: [],
    gaps: [],
    uncertainties: [],
    conflicts: [],
  };
}

export class MockLLMProvider implements LLMProvider {
  readonly id = "mock";
  private readonly plan: MockResearchPlan;
  private readonly extraction?: MockLLMProviderOptions["extraction"];
  private readonly analysis?: MockLLMProviderOptions["analysis"];
  private readonly report?: MockLLMProviderOptions["report"];
  private readonly failExtraction?: MockLLMProviderOptions["failExtraction"];
  private readonly failAnalysis?: MockLLMProviderOptions["failAnalysis"];
  private readonly failReport?: MockLLMProviderOptions["failReport"];

  constructor(options: MockLLMProviderOptions = {}) {
    this.plan = options.plan ?? defaultMockResearchPlan;
    this.extraction = options.extraction;
    this.analysis = options.analysis;
    this.report = options.report;
    this.failExtraction = options.failExtraction;
    this.failAnalysis = options.failAnalysis;
    this.failReport = options.failReport;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    return { text: `echo:${input.prompt}` };
  }

  async generateObject<T>(
    input: GenerateObjectInput,
    schema: ZodType<T>,
  ): Promise<GenerateObjectResult<T>> {
    if (input.system === ANALYSE_SYSTEM_PROMPT && shouldFail(this.failAnalysis, input)) {
      throw new Error("Gemini analysis failed");
    }

    if (input.system === REPORT_SYSTEM_PROMPT && shouldFail(this.failReport, input)) {
      throw new Error("Gemini report generation failed");
    }

    if (
      input.system &&
      input.system.includes("Extract evidence ONLY") &&
      shouldFail(this.failExtraction, input)
    ) {
      throw new Error("Gemini extraction failed");
    }

    const analysis =
      typeof this.analysis === "function"
        ? this.analysis(input)
        : (this.analysis ?? defaultAnalysisFromPrompt(input.prompt));
    const report =
      typeof this.report === "function"
        ? this.report(input)
        : (this.report ?? defaultReportFromPrompt(input.prompt));
    const extraction =
      typeof this.extraction === "function"
        ? this.extraction(input)
        : (this.extraction ?? defaultExtractionFromPrompt(input.prompt));

    for (const candidate of [this.plan, analysis, report, extraction]) {
      const parsed = schema.safeParse(candidate);
      if (parsed.success) {
        return { object: parsed.data };
      }
    }

    throw new Error("Mock LLM could not satisfy the requested schema");
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
