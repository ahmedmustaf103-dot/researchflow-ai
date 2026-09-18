/**
 * Deterministic evaluation types for ResearchFlow Phase 4.
 * Fixture-based offline quality + reliability scoring — not live research.
 */

export type EvalCategory = "quality" | "reliability";

export type EvalCheck = {
  /** Stable check identifier within a case */
  id: string;
  /** Human-readable description of what was measured */
  description: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
};

export type EvalMetrics = {
  quoteSupportRate?: number;
  citationValidityRate?: number;
  hallucinatedSourceRejectionRate?: number;
  planConstraintRate?: number;
  conflictDetectionRate?: number;
  reliabilityPassRate?: number;
  [key: string]: number | undefined;
};

export type EvalResult = {
  caseId: string;
  passed: boolean;
  checks: EvalCheck[];
  metrics: EvalMetrics;
};

/**
 * An executable evaluation case.
 * Cases produce structured results; they are not ordinary unit assertions.
 */
export type EvalCase = {
  id: string;
  title: string;
  category: EvalCategory;
  description: string;
  execute: () => Promise<EvalResult> | EvalResult;
};

export type EvalReport = {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  results: EvalResult[];
  metrics: EvalMetrics;
};

export type ScorerOutput = {
  checks: EvalCheck[];
  metrics: EvalMetrics;
};

export function makeCheck(
  id: string,
  description: string,
  expected: unknown,
  actual: unknown,
  passed: boolean,
): EvalCheck {
  return { id, description, expected, actual, passed };
}

export function rate(passedCount: number, total: number): number {
  if (total <= 0) {
    return 1;
  }
  return passedCount / total;
}

export function allChecksPassed(checks: EvalCheck[]): boolean {
  return checks.length > 0 && checks.every((check) => check.passed);
}
