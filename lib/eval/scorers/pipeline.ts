import { RESEARCH_STAGES, type ResearchStage, type ResearchStatus } from "@/lib/research/types";
import {
  allChecksPassed,
  makeCheck,
  type ScorerOutput,
} from "../types";

export type PipelineScoreInput = {
  executedStages: ResearchStage[];
  status: ResearchStatus;
  expectedStatus: ResearchStatus;
  expectReport: boolean;
  hasReport: boolean;
  sourceUrls?: string[];
  expectNoMcpFabrication?: boolean;
};

/**
 * Score pipeline stage order, terminal status, and hard-fail report rules.
 */
export function scorePipelineOutcome(input: PipelineScoreInput): ScorerOutput {
  const expectedOrder = [...RESEARCH_STAGES];
  const enrichIndex = expectedOrder.indexOf("enrich");
  const retrieveIndex = expectedOrder.indexOf("retrieve");
  const extractIndex = expectedOrder.indexOf("extract");

  const enrichBetween =
    enrichIndex > retrieveIndex && enrichIndex < extractIndex;

  const prefixMatches = input.executedStages.every(
    (stage, index) => expectedOrder[index] === stage,
  );

  const noMcpFabrication =
    input.expectNoMcpFabrication !== true ||
    !(input.sourceUrls ?? []).some((url) => url.startsWith("mcp://"));

  const reportRuleOk = input.expectReport
    ? input.hasReport
    : input.hasReport === false;

  const checks = [
    makeCheck(
      "pipeline.enrich_after_retrieve",
      "enrich must occur after retrieve and before extract in RESEARCH_STAGES",
      true,
      enrichBetween,
      enrichBetween,
    ),
    makeCheck(
      "pipeline.executed_prefix",
      "Executed stages must follow RESEARCH_STAGES order as a prefix",
      input.executedStages,
      input.executedStages,
      prefixMatches,
    ),
    makeCheck(
      "pipeline.terminal_status",
      "Pipeline terminal status must match expectation",
      input.expectedStatus,
      input.status,
      input.status === input.expectedStatus,
    ),
    makeCheck(
      "pipeline.report_presence",
      input.expectReport
        ? "Successful runs must persist a report"
        : "Hard stage failure must not persist a report",
      input.expectReport,
      input.hasReport,
      reportRuleOk,
    ),
  ];

  if (input.expectNoMcpFabrication) {
    checks.push(
      makeCheck(
        "pipeline.no_fabricated_mcp_sources",
        "MCP failure must not fabricate mcp:// Sources",
        false,
        (input.sourceUrls ?? []).some((url) => url.startsWith("mcp://")),
        noMcpFabrication,
      ),
    );
  }

  return {
    checks,
    metrics: {
      executedStageCount: input.executedStages.length,
    },
  };
}

export function pipelineScorePassed(output: ScorerOutput): boolean {
  return allChecksPassed(output.checks);
}

export function scoreConflictDetection(input: {
  analysisConflicts: Array<{ topic: string; statements: string[] }>;
  expectConflict: boolean;
}): ScorerOutput {
  const detected = input.analysisConflicts.length > 0;
  const passed = input.expectConflict ? detected : !detected;

  return {
    checks: [
      makeCheck(
        "conflicts.detected",
        "Analysis should report conflicts for opposing fixture evidence",
        input.expectConflict,
        detected,
        passed,
      ),
      makeCheck(
        "conflicts.has_statements",
        "Detected conflicts should include opposing statements",
        true,
        input.analysisConflicts.every(
          (item) => item.statements.length >= 2 || !input.expectConflict,
        ),
        !input.expectConflict ||
          input.analysisConflicts.some((item) => item.statements.length >= 2),
      ),
    ],
    metrics: {
      conflictDetectionRate: passed ? 1 : 0,
      conflictCount: input.analysisConflicts.length,
    },
  };
}
