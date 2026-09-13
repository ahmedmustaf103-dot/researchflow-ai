import { describe, expect, it } from "vitest";
import { createMockLLMProvider } from "@/lib/ai/mock";
import type { GenerateObjectInput, LLMProvider } from "@/lib/ai/provider";
import { sanitizeSourceIds } from "@/lib/research/citations";
import { createMemoryResearchStore } from "@/lib/research/memory-store";
import {
  generateCitationBackedReport,
  renderCitationBackedReport,
  researchReportSchema,
  sanitizeReportCitations,
  type ResearchReport,
} from "@/lib/research/report";
import type { Finding, Source } from "@/lib/research/types";

const projectSource: Source = {
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

const otherProjectSource: Source = {
  ...projectSource,
  id: "src_other",
  projectId: "proj_other",
  url: "https://evil.example/other",
  title: "Other project source",
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

const analysis = {
  summary: "Named competitors appear in the supplied findings.",
  comparisons: [],
  similarities: [],
  differences: [],
  gaps: ["Pricing is missing."],
  uncertainties: ["Market share is unclear."],
  conflicts: [],
};

function report(overrides: Partial<ResearchReport> = {}): ResearchReport {
  return {
    title: "Stripe competitor report",
    executiveSummary: "Adyen and PayPal appear as competitors.",
    scope: "Limited to the supplied findings.",
    keyFindings: [
      {
        text: "Adyen and PayPal compete with Stripe.",
        sourceIds: ["S1"],
      },
    ],
    comparisons: [
      {
        dimension: "Competitors",
        points: ["Adyen and PayPal are named."],
        sourceIds: ["S1"],
      },
    ],
    strengthsWeaknesses: [],
    gaps: ["Pricing is missing."],
    uncertainties: ["Market share is unclear."],
    conflicts: [
      {
        topic: "Coverage",
        statements: ["Only one source names competitors."],
        sourceIds: ["S1"],
      },
    ],
    ...overrides,
  };
}

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

describe("citation validation", () => {
  it("accepts valid project source IDs and labels", () => {
    expect(sanitizeSourceIds(["src_project", "S1"], [projectSource])).toEqual([
      "src_project",
    ]);
  });

  it("removes invalid and invented IDs", () => {
    expect(
      sanitizeSourceIds(["src_invented", "https://hallucinated.example"], [
        projectSource,
      ]),
    ).toEqual([]);
  });

  it("rejects a source from another project", () => {
    expect(
      sanitizeSourceIds(["src_other"], [projectSource]),
    ).toEqual([]);
  });

  it("does not create a source from model output", () => {
    const sanitized = sanitizeReportCitations(
      report({
        keyFindings: [
          {
            text: "Invented claim",
            sourceIds: ["src_invented", "src_other", "S1"],
          },
        ],
      }),
      [projectSource],
    );

    expect(sanitized.keyFindings[0]?.sourceIds).toEqual(["src_project"]);
  });
});

describe("citation-backed reports", () => {
  it("generates a structured report with citations", async () => {
    const recorder = new RecordingLLM(report());
    const generated = await generateCitationBackedReport({
      question: "Research the top competitors of Stripe",
      analysis,
      findings: [finding],
      sources: [projectSource],
      llm: recorder as unknown as LLMProvider,
    });

    expect(generated.markdown).toContain("Stripe competitor report");
    expect(generated.markdown).toContain("Adyen and PayPal compete with Stripe.");
    expect(generated.markdown).toContain("Competitors");
    expect(generated.markdown).toContain("Pricing is missing.");
    expect(generated.markdown).toContain("Market share is unclear.");
    expect(generated.markdown).toContain("Coverage");
    expect(generated.markdown).toContain("[1]");
    expect(generated.markdown).toContain("https://example.com/competitors");
    expect(recorder.prompt).toContain(finding.value);
    expect(recorder.prompt).not.toContain("src_project");
  });

  it("builds the Sources section from database sources only", () => {
    const generated = renderCitationBackedReport({
      question: "Research the top competitors of Stripe",
      report: sanitizeReportCitations(
        report({
          keyFindings: [
            {
              text: "A valid claim",
              sourceIds: ["S1", "src_invented"],
            },
          ],
        }),
        [projectSource],
      ),
      sources: [projectSource, otherProjectSource],
    });

    expect(generated.markdown).toContain("https://example.com/competitors");
    expect(generated.markdown).not.toContain("https://evil.example/other");
    expect(generated.markdown).not.toContain("src_invented");
  });

  it("persists a sanitized report", async () => {
    const store = createMemoryResearchStore();
    const project = await store.createProject({
      userId: "user-1",
      title: "Stripe research",
      question: "Research the top competitors of Stripe",
    });
    const generated = await generateCitationBackedReport({
      question: project.question,
      analysis,
      findings: [finding],
      sources: [projectSource],
      llm: new RecordingLLM(report()) as unknown as LLMProvider,
    });

    const saved = await store.createReport({
      projectId: project.id,
      markdown: generated.markdown,
      outlineJson: JSON.parse(JSON.stringify(generated.outline)),
    });

    expect(saved.projectId).toBe(project.id);
    expect(saved.version).toBe(1);
    expect(saved.markdown).toContain("https://example.com/competitors");
  });

  it("fails cleanly when Gemini report generation throws", async () => {
    await expect(
      generateCitationBackedReport({
        question: "Research the top competitors of Stripe",
        analysis,
        findings: [finding],
        sources: [projectSource],
        llm: createMockLLMProvider({ failReport: true }),
      }),
    ).rejects.toMatchObject({
      name: "ResearchStageError",
      stage: "report",
    });
  });

  it("validates the report schema shape", () => {
    expect(researchReportSchema.parse(report()).keyFindings).toHaveLength(1);
  });
});
