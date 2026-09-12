import { describe, expect, it } from "vitest";
import { createMockLLMProvider } from "@/lib/ai/mock";
import type {
  GenerateObjectInput,
  LLMProvider,
} from "@/lib/ai/provider";
import {
  clampExtractedFindings,
  extractedFindingSchema,
  extractedFindingsSchema,
  extractEvidenceFromSource,
  extractEvidenceFromSources,
  isSourceEligibleForExtraction,
  quoteExistsInSource,
  selectVerifiedFindings,
  toCreateFindingInput,
} from "@/lib/research/extract";
import { MAX_FINDINGS_PER_SOURCE } from "@/lib/research/limits";
import { createMemoryResearchStore } from "@/lib/research/memory-store";
import type { Source } from "@/lib/research/types";

const sourceContent =
  "Adyen, PayPal, and Square are frequently cited as Stripe competitors.";

function source(overrides: Partial<Source> = {}): Source {
  return {
    id: "src_1",
    projectId: "proj_1",
    taskId: "task_1",
    url: "https://example.com/competitors",
    title: "Competitor landscape",
    snippet: "Snippet",
    content: sourceContent,
    contentHash: "hash",
    httpStatus: 200,
    toolName: "fetch_page",
    fetchedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function finding(overrides: Partial<{
  claim: string;
  quote: string;
  relevance: string;
}> = {}) {
  return {
    claim: "Adyen, PayPal, and Square compete with Stripe.",
    quote: "Adyen, PayPal, and Square are frequently cited as Stripe competitors.",
    relevance: "Identifies named competitors for the research question.",
    ...overrides,
  };
}

class RecordingLLM {
  readonly id = "recording";
  prompts: string[] = [];

  constructor(
    private readonly payload: unknown,
    private readonly failFor?: (prompt: string) => boolean,
  ) {}

  async generateText() {
    return { text: "" };
  }

  async generateObject(input: GenerateObjectInput) {
    this.prompts.push(input.prompt);
    if (this.failFor?.(input.prompt)) {
      throw new Error("Gemini extraction failed");
    }
    return { object: this.payload };
  }

  async generateWithTools() {
    return { toolCalls: [] };
  }

  async embed() {
    return { embeddings: [] };
  }
}

describe("extraction schema", () => {
  it("accepts a valid finding", () => {
    expect(extractedFindingSchema.parse(finding())).toMatchObject(finding());
  });

  it("accepts an empty findings array", () => {
    expect(extractedFindingsSchema.parse({ findings: [] })).toEqual({
      findings: [],
    });
  });

  it("rejects an empty claim", () => {
    expect(() => extractedFindingSchema.parse(finding({ claim: "   " }))).toThrow();
  });

  it("rejects an empty quote", () => {
    expect(() => extractedFindingSchema.parse(finding({ quote: "" }))).toThrow();
  });

  it("rejects empty relevance", () => {
    expect(() =>
      extractedFindingSchema.parse(finding({ relevance: " " })),
    ).toThrow();
  });

  it("clamps excessive findings to 8", () => {
    const findings = Array.from({ length: 10 }, (_, index) =>
      finding({ claim: `Claim ${index + 1}` }),
    );

    expect(clampExtractedFindings(findings)).toHaveLength(MAX_FINDINGS_PER_SOURCE);
  });
});

describe("quote verification", () => {
  it("accepts an exact quote", () => {
    expect(quoteExistsInSource(finding().quote, sourceContent)).toBe(true);
  });

  it("accepts a whitespace-normalized quote", () => {
    expect(
      quoteExistsInSource(
        "Adyen,   PayPal, and\nSquare are frequently cited as Stripe competitors.",
        sourceContent,
      ),
    ).toBe(true);
  });

  it("rejects a quote that is not present", () => {
    expect(
      quoteExistsInSource("Gemini invented this quotation.", sourceContent),
    ).toBe(false);
  });

  it("rejects an empty quote", () => {
    expect(quoteExistsInSource("   ", sourceContent)).toBe(false);
  });
});

describe("evidence extraction", () => {
  it("extracts findings and attaches the application source ID", async () => {
    const llm = new RecordingLLM({ findings: [finding()] }) as unknown as LLMProvider;
    const persisted = await extractEvidenceFromSource({
      question: "Research the top competitors of Stripe",
      source: source(),
      llm,
    });

    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.sourceId).toBe("src_1");
    expect(persisted[0]?.projectId).toBe("proj_1");
    expect(persisted[0]?.value).toBe(finding().claim);
    expect(persisted[0]?.quote).toBe(finding().quote);
    expect(persisted[0]?.attribute).toBe(finding().relevance);
    expect((llm as unknown as RecordingLLM).prompts[0]).toContain(sourceContent);
    expect((llm as unknown as RecordingLLM).prompts[0]).not.toContain("src_1");
  });

  it("skips sources with no retrieved content", async () => {
    const llm = new RecordingLLM({ findings: [finding()] }) as unknown as LLMProvider;
    const persisted = await extractEvidenceFromSource({
      question: "Research the top competitors of Stripe",
      source: source({ content: "   ", contentHash: null }),
      llm,
    });

    expect(persisted).toEqual([]);
    expect((llm as unknown as RecordingLLM).prompts).toHaveLength(0);
  });

  it("skips retrieval-failed sources", async () => {
    const llm = new RecordingLLM({ findings: [finding()] }) as unknown as LLMProvider;
    const persisted = await extractEvidenceFromSource({
      question: "Research the top competitors of Stripe",
      source: source({
        content: null,
        httpStatus: 502,
        fetchedAt: new Date(),
      }),
      llm,
    });

    expect(isSourceEligibleForExtraction(source({ content: null, httpStatus: 502 }))).toBe(
      false,
    );
    expect(persisted).toEqual([]);
    expect((llm as unknown as RecordingLLM).prompts).toHaveLength(0);
  });

  it("continues after Gemini fails on one source", async () => {
    const llm = new RecordingLLM({ findings: [finding()] }, (prompt) =>
      prompt.includes("broken"),
    ) as unknown as LLMProvider;

    const persisted = await extractEvidenceFromSources({
      question: "Research the top competitors of Stripe",
      sources: [
        source({
          id: "src_fail",
          url: "https://example.com/broken",
          title: "broken",
          content: "broken page content that mentions Stripe competitors",
        }),
        source({ id: "src_ok" }),
      ],
      tasks: [],
      llm,
    });

    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.sourceId).toBe("src_ok");
  });

  it("allows zero findings", async () => {
    const llm = new RecordingLLM({ findings: [] }) as unknown as LLMProvider;
    const persisted = await extractEvidenceFromSource({
      question: "Research the top competitors of Stripe",
      source: source(),
      llm,
    });

    expect(persisted).toEqual([]);
  });

  it("enforces a maximum of 8 findings per source", async () => {
    const llm = new RecordingLLM({
      findings: Array.from({ length: 10 }, (_, index) =>
        finding({ claim: `Claim ${index + 1}` }),
      ),
    }) as unknown as LLMProvider;

    const persisted = await extractEvidenceFromSource({
      question: "Research the top competitors of Stripe",
      source: source(),
      llm,
    });

    expect(persisted).toHaveLength(MAX_FINDINGS_PER_SOURCE);
  });

  it("does not persist a finding whose quote is missing from the source", async () => {
    const llm = new RecordingLLM({
      findings: [
        finding({ quote: "This quote does not exist in the source." }),
        finding(),
      ],
    }) as unknown as LLMProvider;

    const persisted = await extractEvidenceFromSource({
      question: "Research the top competitors of Stripe",
      source: source(),
      llm,
    });

    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.quote).toBe(finding().quote);
  });
});

describe("finding persistence", () => {
  it("saves verified findings with the correct project, task, and source IDs", async () => {
    const store = createMemoryResearchStore();
    const project = await store.createProject({
      userId: "user-1",
      title: "Stripe research",
      question: "Research the top competitors of Stripe",
    });
    const task = await store.createTask({
      projectId: project.id,
      title: "Identify competitors",
      query: "Stripe competitors",
      sortOrder: 1,
    });
    const created = await store.createSource({
      projectId: project.id,
      taskId: task.id,
      url: "https://example.com/competitors",
      title: "Competitor landscape",
      content: sourceContent,
      httpStatus: 200,
      fetchedAt: new Date(),
      toolName: "fetch_page",
    });

    const llm = createMockLLMProvider({
      extraction: { findings: [finding()] },
    });
    const extracted = await extractEvidenceFromSource({
      question: project.question,
      source: created,
      task,
      llm,
    });

    for (const item of extracted) {
      await store.createFinding(item);
    }

    const findings = await store.listFindings(project.id);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.projectId).toBe(project.id);
    expect(findings[0]?.sourceId).toBe(created.id);
    expect(created.taskId).toBe(task.id);
    expect(findings[0]?.value).toBe(finding().claim);
    expect(findings[0]?.quote).toBe(finding().quote);
  });

  it("does not save unsupported quoted evidence", async () => {
    const rejected = selectVerifiedFindings(
      [finding({ quote: "Invented quotation about Stripe." })],
      sourceContent,
      "src_1",
    );

    expect(rejected).toEqual([]);
    expect(toCreateFindingInput(finding(), source()).sourceId).toBe("src_1");
  });
});
