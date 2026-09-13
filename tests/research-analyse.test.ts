import { describe, expect, it } from "vitest";
import { createMockLLMProvider } from "@/lib/ai/mock";
import type { GenerateObjectInput, LLMProvider } from "@/lib/ai/provider";
import {
  analyseResearch,
  researchAnalysisSchema,
} from "@/lib/research/analyse";
import { ResearchStageError } from "@/lib/research/errors";
import type { Finding, Source } from "@/lib/research/types";

const source: Source = {
  id: "src_project",
  projectId: "proj_1",
  taskId: "task_1",
  url: "https://example.com/competitors",
  title: "Competitor landscape",
  snippet: null,
  content: "Adyen and PayPal compete with Stripe.",
  contentHash: null,
  httpStatus: 200,
  toolName: "fetch_page",
  fetchedAt: new Date(),
  createdAt: new Date(),
};

const finding: Finding = {
  id: "find_1",
  projectId: "proj_1",
  sourceId: "src_project",
  subject: "evidence",
  attribute: "Names Stripe competitors",
  value: "Adyen and PayPal compete with Stripe.",
  quote: "Adyen and PayPal compete with Stripe.",
  confidence: 1,
  createdAt: new Date(),
};

class RecordingLLM {
  readonly id = "recording";
  prompt = "";

  constructor(private readonly payload: unknown) {}

  async generateText() {
    return { text: "" };
  }

  async generateObject(input: GenerateObjectInput) {
    this.prompt = input.prompt;
    return { object: this.payload };
  }

  async generateWithTools() {
    return { toolCalls: [] };
  }

  async embed() {
    return { embeddings: [] };
  }
}

const validAnalysis = {
  summary: "The supplied findings identify named Stripe competitors.",
  comparisons: [
    {
      dimension: "competitors",
      points: ["Adyen and PayPal are named as competitors."],
    },
  ],
  similarities: [],
  differences: [],
  gaps: ["Pricing details are missing."],
  uncertainties: ["Market share is not established."],
  conflicts: [
    {
      topic: "Competitor set",
      statements: ["One source names Adyen.", "Another source is silent."],
    },
  ],
};

describe("research analysis", () => {
  it("accepts a valid analysis and passes findings into Gemini", async () => {
    const recorder = new RecordingLLM(validAnalysis);
    const result = await analyseResearch({
      question: "Research the top competitors of Stripe",
      findings: [finding],
      sources: [source],
      llm: recorder as unknown as LLMProvider,
    });

    expect(result.summary).toContain("Stripe");
    expect(result.gaps).toContain("Pricing details are missing.");
    expect(result.uncertainties).toHaveLength(1);
    expect(result.conflicts[0]?.topic).toBe("Competitor set");
    expect(recorder.prompt).toContain(finding.value);
    expect(recorder.prompt).toContain(finding.quote);
    expect(recorder.prompt).toContain("S1");
    expect(recorder.prompt).not.toContain("src_project");
  });

  it("records missing information as gaps when there are no findings", async () => {
    const result = await analyseResearch({
      question: "Research the top competitors of Stripe",
      findings: [],
      sources: [],
      llm: createMockLLMProvider(),
    });

    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it("rejects invalid structured output", async () => {
    const llm = new RecordingLLM({ summary: "" }) as unknown as LLMProvider;

    await expect(
      analyseResearch({
        question: "Research the top competitors of Stripe",
        findings: [finding],
        sources: [source],
        llm,
      }),
    ).rejects.toBeInstanceOf(ResearchStageError);
  });

  it("fails cleanly when Gemini analysis throws", async () => {
    await expect(
      analyseResearch({
        question: "Research the top competitors of Stripe",
        findings: [finding],
        sources: [source],
        llm: createMockLLMProvider({ failAnalysis: true }),
      }),
    ).rejects.toMatchObject({
      name: "ResearchStageError",
      stage: "analyse",
    });
  });

  it("validates the analysis schema shape", () => {
    expect(researchAnalysisSchema.parse(validAnalysis).conflicts).toHaveLength(1);
  });
});
