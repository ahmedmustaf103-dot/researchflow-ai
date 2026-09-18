import type { EvalCase, EvalReport, EvalResult, EvalMetrics } from "./types";
import { rate } from "./types";

/**
 * Run a single evaluation case and normalise the result.
 */
export async function runEvalCase(evalCase: EvalCase): Promise<EvalResult> {
  const raw = await evalCase.execute();
  const checks = raw.checks ?? [];
  const passed =
    typeof raw.passed === "boolean"
      ? raw.passed
      : checks.length > 0 && checks.every((check) => check.passed);

  return {
    caseId: evalCase.id,
    passed,
    checks,
    metrics: raw.metrics ?? {},
  };
}

function averageDefined(
  results: EvalResult[],
  key: keyof EvalMetrics,
): number | undefined {
  const values = results
    .map((result) => result.metrics[key])
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Run a suite of evaluation cases and aggregate a report.
 * Metrics are computed from case results — never hard-coded.
 */
export async function runEvalSuite(cases: EvalCase[]): Promise<EvalReport> {
  const results: EvalResult[] = [];

  for (const evalCase of cases) {
    results.push(await runEvalCase(evalCase));
  }

  const passedCases = results.filter((result) => result.passed).length;
  const failedCases = results.length - passedCases;

  const reliabilityResults = results.filter((result) =>
    result.caseId.startsWith("reliability."),
  );
  const reliabilityPassed = reliabilityResults.filter(
    (result) => result.passed,
  ).length;

  const metrics: EvalMetrics = {
    quoteSupportRate: averageDefined(results, "quoteSupportRate"),
    citationValidityRate: averageDefined(results, "citationValidityRate"),
    hallucinatedSourceRejectionRate: averageDefined(
      results,
      "hallucinatedSourceRejectionRate",
    ),
    planConstraintRate: averageDefined(results, "planConstraintRate"),
    conflictDetectionRate: averageDefined(results, "conflictDetectionRate"),
    reliabilityPassRate:
      reliabilityResults.length > 0
        ? rate(reliabilityPassed, reliabilityResults.length)
        : averageDefined(results, "reliabilityPassRate"),
  };

  // Drop undefined metric keys for a clean report.
  for (const key of Object.keys(metrics)) {
    if (metrics[key] === undefined) {
      delete metrics[key];
    }
  }

  return {
    totalCases: results.length,
    passedCases,
    failedCases,
    passRate: rate(passedCases, results.length),
    results,
    metrics,
  };
}
