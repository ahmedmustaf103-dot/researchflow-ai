import {
  allChecksPassed,
  makeCheck,
  rate,
  type ScorerOutput,
} from "../types";

export type ReliabilityAttemptInput = {
  /** Total fetch/execute attempts observed */
  attempts: number;
  /** Maximum attempts allowed (initial + retries) */
  maxAttempts: number;
  /** Whether the final ToolResult/operation succeeded */
  succeeded: boolean;
  /** For non-retryable failures: expect exactly one attempt */
  expectSingleAttempt?: boolean;
};

/**
 * Score retry-budget behaviour without reimplementing retry logic.
 */
export function scoreRetryBudget(input: ReliabilityAttemptInput): ScorerOutput {
  const withinBudget = input.attempts <= input.maxAttempts;
  const singleAttemptOk =
    input.expectSingleAttempt !== true || input.attempts === 1;

  const checks = [
    makeCheck(
      "reliability.attempts_within_budget",
      "Observed attempts must stay within the configured retry budget",
      { maxAttempts: input.maxAttempts },
      input.attempts,
      withinBudget,
    ),
    makeCheck(
      "reliability.non_retryable_single_attempt",
      "Non-retryable failures must not be retried",
      input.expectSingleAttempt === true ? 1 : "n/a",
      input.attempts,
      singleAttemptOk,
    ),
  ];

  if (input.succeeded) {
    checks.push(
      makeCheck(
        "reliability.eventually_succeeded",
        "Operation eventually succeeded within budget",
        true,
        true,
        true,
      ),
    );
  }

  return {
    checks,
    metrics: {
      reliabilityPassRate: rate(
        checks.filter((check) => check.passed).length,
        checks.length,
      ),
      attempts: input.attempts,
      maxAttempts: input.maxAttempts,
    },
  };
}

export type SoftFailIsolationInput = {
  projectStatus: string;
  expectedStatus: string;
  fabricatedSources: boolean;
  expectFabricatedSources?: boolean;
  hasReport: boolean;
  expectReport: boolean;
  preservedSourceCount?: number;
  expectPreservedSources?: number;
};

/**
 * Score soft/hard failure isolation outcomes.
 */
export function scoreFailureIsolation(
  input: SoftFailIsolationInput,
): ScorerOutput {
  const expectFabricated = input.expectFabricatedSources === true;
  const fabricationOk = expectFabricated
    ? input.fabricatedSources
    : !input.fabricatedSources;

  const checks = [
    makeCheck(
      "reliability.project_status",
      "Project status after failure scenario",
      input.expectedStatus,
      input.projectStatus,
      input.projectStatus === input.expectedStatus,
    ),
    makeCheck(
      "reliability.report_rule",
      "Report presence must match hard/soft failure expectation",
      input.expectReport,
      input.hasReport,
      input.hasReport === input.expectReport,
    ),
    makeCheck(
      "reliability.no_fabrication",
      "Failure must not fabricate sources unless explicitly expected",
      expectFabricated,
      input.fabricatedSources,
      fabricationOk,
    ),
  ];

  if (
    input.expectPreservedSources !== undefined &&
    input.preservedSourceCount !== undefined
  ) {
    checks.push(
      makeCheck(
        "reliability.sources_preserved",
        "Partial retrieval failure must preserve existing Sources",
        input.expectPreservedSources,
        input.preservedSourceCount,
        input.preservedSourceCount >= input.expectPreservedSources,
      ),
    );
  }

  return {
    checks,
    metrics: {
      reliabilityPassRate: rate(
        checks.filter((check) => check.passed).length,
        checks.length,
      ),
    },
  };
}

export function reliabilityScorePassed(output: ScorerOutput): boolean {
  return allChecksPassed(output.checks);
}
