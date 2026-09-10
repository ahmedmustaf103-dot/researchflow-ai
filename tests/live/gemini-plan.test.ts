import { describe, expect, it } from "vitest";
import { createGeminiProvider } from "@/lib/ai/gemini";
import { MAX_RESEARCH_TASKS, planResearch } from "@/lib/research/plan";

const enabled = process.env.LIVE_API_TESTS === "1";

describe.skipIf(!enabled)("live Gemini planning", () => {
  it("returns a validated structured research plan", async () => {
    const llm = createGeminiProvider();
    const plan = await planResearch(
      "Research the top competitors of Stripe and compare their pricing and features.",
      llm,
    );

    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(MAX_RESEARCH_TASKS);

    for (const [index, task] of plan.entries()) {
      expect(task.title.trim().length).toBeGreaterThan(0);
      expect(task.query.trim().length).toBeGreaterThan(0);
      expect(task.sortOrder).toBe(index + 1);
    }
  }, 60_000);
});
