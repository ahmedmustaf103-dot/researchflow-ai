import { describe, expect, it } from "vitest";
import { createMockLLMProvider } from "@/lib/ai/mock";
import { createMemoryResearchStore } from "@/lib/research/memory-store";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { createQueuedProject } from "@/lib/research/service";
import { RESEARCH_STAGES } from "@/lib/research/types";

describe("Phase 2D pipeline", () => {
  it("runs analyse after extract, persists a citation-backed report, and completes", async () => {
    const store = createMemoryResearchStore();
    const project = await createQueuedProject(
      "user-1",
      "Research the top competitors of Stripe",
      store,
    );

    const result = await runResearchPipeline(project.id, {
      store,
      llm: createMockLLMProvider(),
    });
    const detail = await store.getProjectDetail(project.id, "user-1");
    const sourceUrls = new Set(detail?.sources.map((source) => source.url));

    expect(result.status).toBe("completed");
    expect(result.executedStages).toEqual([...RESEARCH_STAGES]);
    expect(detail?.findings.length).toBeGreaterThan(0);
    expect(detail?.report?.markdown).toContain("Executive summary");
    expect(detail?.report?.markdown).toContain("## Sources");
    expect(detail?.report?.markdown).toContain("Stripe");

    for (const source of detail?.sources ?? []) {
      if (detail?.report?.markdown.includes(source.url)) {
        expect(sourceUrls.has(source.url)).toBe(true);
      }
    }

    expect(detail?.report?.markdown).not.toContain("https://hallucinated.example");
  });

  it("stops cleanly when analysis fails", async () => {
    const store = createMemoryResearchStore();
    const project = await createQueuedProject(
      "user-1",
      "Research the top competitors of Stripe",
      store,
    );

    const result = await runResearchPipeline(project.id, {
      store,
      llm: createMockLLMProvider({ failAnalysis: true }),
    });
    const detail = await store.getProjectDetail(project.id, "user-1");

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/analysis failed/);
    expect(result.executedStages).toEqual([
      "plan",
      "search",
      "retrieve",
      "enrich",
      "extract",
      "verify",
    ]);
    expect(detail?.report).toBeNull();
  });

  it("stops cleanly when report generation fails", async () => {
    const store = createMemoryResearchStore();
    const project = await createQueuedProject(
      "user-1",
      "Research the top competitors of Stripe",
      store,
    );

    const result = await runResearchPipeline(project.id, {
      store,
      llm: createMockLLMProvider({ failReport: true }),
    });
    const detail = await store.getProjectDetail(project.id, "user-1");

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/report generation failed/);
    expect(result.executedStages).toEqual([
      "plan",
      "search",
      "retrieve",
      "enrich",
      "extract",
      "verify",
      "analyse",
    ]);
    expect(detail?.report).toBeNull();
  });
});
