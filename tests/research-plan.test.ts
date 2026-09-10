import { describe, expect, it } from "vitest";
import type {
  EmbedInput,
  GenerateObjectInput,
  GenerateTextInput,
  GenerateWithToolsInput,
  LLMProvider,
  ProviderToolDefinition,
} from "@/lib/ai/provider";
import {
  clampAndNormalizePlan,
  MAX_RESEARCH_TASKS,
  planResearch,
  type ResearchPlan,
} from "@/lib/research/plan";
import { ResearchPlanError } from "@/lib/research/errors";

class StubLLMProvider implements LLMProvider {
  readonly id = "stub";

  constructor(private readonly plan: unknown) {}

  async generateText(input: GenerateTextInput) {
    void input;
    return { text: "" };
  }

  async generateObject<T>(input: GenerateObjectInput) {
    void input;
    return { object: this.plan as T };
  }

  async generateWithTools(
    input: GenerateWithToolsInput,
    tools: ProviderToolDefinition[],
  ) {
    void input;
    void tools;
    return { toolCalls: [] };
  }

  async embed(input: EmbedInput) {
    void input;
    return { embeddings: [] };
  }
}

function validPlan(overrides: Partial<ResearchPlan> = {}): ResearchPlan {
  return {
    goal: "Compare Stripe competitors on pricing and features",
    dimensions: ["pricing", "features"],
    tasks: [
      {
        title: "Identify competitors",
        query: "Stripe competitors",
        sortOrder: 4,
      },
      {
        title: "Compare pricing",
        query: "Stripe vs Adyen pricing",
        sortOrder: 9,
      },
    ],
    ...overrides,
  };
}

describe("research planner", () => {
  it("accepts a valid plan", async () => {
    const plan = await planResearch(
      "Research the top competitors of Stripe",
      new StubLLMProvider(validPlan()),
    );

    expect(plan).toEqual([
      {
        title: "Identify competitors",
        query: "Stripe competitors",
        sortOrder: 1,
      },
      {
        title: "Compare pricing",
        query: "Stripe vs Adyen pricing",
        sortOrder: 2,
      },
    ]);
  });

  it("clamps more than 6 tasks to 6", async () => {
    const plan = await planResearch(
      "Research the top competitors of Stripe",
      new StubLLMProvider(
        validPlan({
          tasks: Array.from({ length: 8 }, (_, index) => ({
            title: `Task ${index + 1}`,
            query: `Query ${index + 1}`,
            sortOrder: index + 10,
          })),
        }),
      ),
    );

    expect(plan).toHaveLength(MAX_RESEARCH_TASKS);
    expect(plan.map((task) => task.title)).toEqual([
      "Task 1",
      "Task 2",
      "Task 3",
      "Task 4",
      "Task 5",
      "Task 6",
    ]);
    expect(plan.map((task) => task.sortOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("rejects invalid task data", async () => {
    await expect(
      planResearch(
        "Research the top competitors of Stripe",
        new StubLLMProvider(
          validPlan({
            tasks: [
              {
                title: "",
                query: "Stripe competitors",
                sortOrder: 1,
              },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(ResearchPlanError);
  });

  it("rejects an empty goal", async () => {
    await expect(
      planResearch(
        "Research the top competitors of Stripe",
        new StubLLMProvider(validPlan({ goal: "   " })),
      ),
    ).rejects.toBeInstanceOf(ResearchPlanError);
  });

  it("rejects an empty query", async () => {
    await expect(
      planResearch(
        "Research the top competitors of Stripe",
        new StubLLMProvider(
          validPlan({
            tasks: [
              {
                title: "Identify competitors",
                query: "",
                sortOrder: 1,
              },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(ResearchPlanError);
  });

  it("normalises sort order after clamping", () => {
    const tasks = clampAndNormalizePlan(
      validPlan({
        tasks: [
          { title: "Third", query: "c", sortOrder: 99 },
          { title: "First", query: "a", sortOrder: 0 },
          { title: "Second", query: "b", sortOrder: -4 },
        ],
      }),
    );

    expect(tasks.map((task) => task.sortOrder)).toEqual([1, 2, 3]);
    expect(tasks[0]?.title).toBe("Third");
  });
});
