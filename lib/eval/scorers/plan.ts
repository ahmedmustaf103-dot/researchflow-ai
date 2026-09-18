import { MAX_RESEARCH_TASKS } from "@/lib/research/limits";
import type { PlannedTask } from "@/lib/research/types";
import {
  allChecksPassed,
  makeCheck,
  rate,
  type ScorerOutput,
} from "../types";

export type PlanScoreInput = {
  goal: string;
  tasks: PlannedTask[];
  maxTasks?: number;
};

/**
 * Score planning constraints without calling Gemini.
 */
export function scorePlanConstraints(input: PlanScoreInput): ScorerOutput {
  const maxTasks = input.maxTasks ?? MAX_RESEARCH_TASKS;
  const { goal, tasks } = input;

  const nonEmptyTitles = tasks.every((task) => task.title.trim().length > 0);
  const nonEmptyQueries = tasks.every((task) => task.query.trim().length > 0);
  const validSortOrder = tasks.every(
    (task, index) => task.sortOrder === index + 1,
  );
  const taskCountOk = tasks.length > 0 && tasks.length <= maxTasks;
  const goalOk = goal.trim().length > 0;

  const checks = [
    makeCheck(
      "plan.goal_non_empty",
      "Research plan goal must be non-empty",
      true,
      goalOk,
      goalOk,
    ),
    makeCheck(
      "plan.task_count",
      `Task count must be between 1 and ${maxTasks}`,
      { min: 1, max: maxTasks },
      tasks.length,
      taskCountOk,
    ),
    makeCheck(
      "plan.titles_non_empty",
      "Every task title must be non-empty",
      true,
      nonEmptyTitles,
      nonEmptyTitles,
    ),
    makeCheck(
      "plan.queries_non_empty",
      "Every task query must be non-empty",
      true,
      nonEmptyQueries,
      nonEmptyQueries,
    ),
    makeCheck(
      "plan.sort_order",
      "sortOrder must be normalised to 1..n",
      tasks.map((_, index) => index + 1),
      tasks.map((task) => task.sortOrder),
      validSortOrder,
    ),
  ];

  const planConstraintRate = rate(
    checks.filter((check) => check.passed).length,
    checks.length,
  );

  return {
    checks,
    metrics: {
      planConstraintRate,
      taskCount: tasks.length,
    },
  };
}

export function planScorePassed(output: ScorerOutput): boolean {
  return allChecksPassed(output.checks);
}
