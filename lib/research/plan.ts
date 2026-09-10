import { z } from "zod";
import type { LLMProvider } from "@/lib/ai/provider";
import { buildPlanUserPrompt, PLAN_SYSTEM_PROMPT } from "@/lib/ai/prompts/plan";
import { ResearchPlanError } from "./errors";
import type { PlannedTask } from "./types";

export const MAX_RESEARCH_TASKS = 6;

export const researchPlanSchema = z.object({
  goal: z.string().trim().min(1, "goal must not be empty"),
  dimensions: z.array(z.string()),
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1, "task title must not be empty"),
        query: z.string().trim().min(1, "task query must not be empty"),
        sortOrder: z.number().int(),
      }),
    )
    .min(1, "at least one research task is required"),
});

export type ResearchPlan = z.infer<typeof researchPlanSchema>;

export function clampAndNormalizePlan(plan: ResearchPlan): PlannedTask[] {
  return plan.tasks.slice(0, MAX_RESEARCH_TASKS).map((task, index) => ({
    title: task.title,
    query: task.query,
    sortOrder: index + 1,
  }));
}

export async function planResearch(
  question: string,
  llm: LLMProvider,
): Promise<PlannedTask[]> {
  const result = await llm.generateObject(
    {
      system: PLAN_SYSTEM_PROMPT,
      prompt: buildPlanUserPrompt(question),
    },
    researchPlanSchema,
  );

  const parsed = researchPlanSchema.safeParse(result.object);
  if (!parsed.success) {
    throw new ResearchPlanError(
      `Invalid research plan: ${z.prettifyError(parsed.error)}`,
      { cause: parsed.error },
    );
  }

  if (!parsed.data.goal.trim()) {
    throw new ResearchPlanError("Research plan goal must not be empty");
  }

  return clampAndNormalizePlan(parsed.data);
}
