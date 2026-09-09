import { describe, expect, it } from "vitest";
import { createMemoryResearchStore } from "@/lib/research/memory-store";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { createQueuedProject } from "@/lib/research/service";
import { RESEARCH_STAGES } from "@/lib/research/types";
import { mockSearchTool } from "@/lib/tools/search";
import { mockFetchPageTool } from "@/lib/tools/fetch-page";

describe("mock research pipeline", () => {
  it("completes every stage in order and lands on completed", async () => {
    const store = createMemoryResearchStore();
    const project = await createQueuedProject(
      "user-1",
      "Research the top competitors of Stripe",
      store,
    );

    const result = await runResearchPipeline(project.id, { store });
    const detail = await store.getProjectDetail(project.id, "user-1");

    expect(result.executedStages).toEqual([...RESEARCH_STAGES]);
    expect(result.status).toBe("completed");
    expect(detail?.status).toBe("completed");
    expect(detail?.tasks.length).toBeGreaterThan(0);
    expect(detail?.sources.length).toBeGreaterThan(0);
    expect(detail?.findings.length).toBeGreaterThan(0);
    expect(detail?.report?.markdown).toContain("Stripe");
  });

  it("changes status as each major phase starts", async () => {
    const store = createMemoryResearchStore();
    const project = await createQueuedProject(
      "user-1",
      "Research the top competitors of Stripe",
      store,
    );

    const seen: string[] = [project.status];
    const originalTransition = store.transitionStatus.bind(store);
    store.transitionStatus = async (id, to, errorMessage) => {
      seen.push(to);
      return originalTransition(id, to, errorMessage);
    };

    await runResearchPipeline(project.id, { store });

    expect(seen).toEqual([
      "queued",
      "planning",
      "researching",
      "verifying",
      "analysing",
      "reporting",
      "completed",
    ]);
  });

  it("marks the project failed when a stage throws", async () => {
    const store = createMemoryResearchStore();
    const project = await createQueuedProject(
      "user-1",
      "Research the top competitors of Stripe",
      store,
    );

    const result = await runResearchPipeline(project.id, {
      store,
      failAt: "search",
    });
    const failed = await store.getProject(project.id);

    expect(result.status).toBe("failed");
    expect(failed?.status).toBe("failed");
    expect(failed?.errorMessage).toContain("search");
    expect(result.executedStages).toEqual(["plan"]);
  });

  it("does not restart a project that has already left queued", async () => {
    const store = createMemoryResearchStore();
    const project = await createQueuedProject(
      "user-1",
      "Research the top competitors of Stripe",
      store,
    );

    await runResearchPipeline(project.id, { store });
    const second = await runResearchPipeline(project.id, { store });
    const detail = await store.getProjectDetail(project.id, "user-1");

    expect(second.status).toBe("completed");
    expect(second.executedStages).toEqual([]);
    expect(detail?.tasks.length).toBeGreaterThan(0);
  });

  it("uses deterministic mock search and fetch tools", async () => {
    const search = await mockSearchTool.execute(
      { query: "Stripe competitors" },
      {},
    );
    const page = await mockFetchPageTool.execute(
      { url: "https://example.com/competitors" },
      {},
    );

    expect(search.ok).toBe(true);
    expect(page.ok).toBe(true);
    if (search.ok) {
      expect(search.data.results).toHaveLength(3);
    }
    if (page.ok) {
      expect(page.data.content).toContain("Adyen");
    }
  });
});
