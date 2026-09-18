import { describe, expect, it } from "vitest";
import {
  allEvalCases,
  makeCheck,
  qualityCases,
  rate,
  reliabilityCases,
  runEvalCase,
  runEvalSuite,
  scoreQuoteSupport,
} from "@/lib/eval";
import {
  fixtureAttemptedFindings,
  fixtureSourceA,
  fixtureSourceB,
  fixtureSourceC,
} from "@/lib/eval/cases/fixtures";

describe("eval runner", () => {
  it("runs a single case into a structured EvalResult", async () => {
    const [planCase] = qualityCases();
    expect(planCase).toBeDefined();

    const result = await runEvalCase(planCase!);
    expect(result.caseId).toBe("plan.constraints");
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.checks.every((check) => "expected" in check)).toBe(true);
    expect(result.checks.every((check) => "actual" in check)).toBe(true);
    expect(typeof result.passed).toBe("boolean");
    expect(result.metrics.planConstraintRate).toBe(1);
  });

  it("aggregates a suite report from case metrics", async () => {
    const report = await runEvalSuite(allEvalCases());

    expect(report.totalCases).toBe(allEvalCases().length);
    expect(report.passedCases + report.failedCases).toBe(report.totalCases);
    expect(report.passRate).toBe(
      report.passedCases / Math.max(report.totalCases, 1),
    );
    expect(report.results).toHaveLength(report.totalCases);
    expect(report.metrics.quoteSupportRate).toBeTypeOf("number");
    expect(report.metrics.reliabilityPassRate).toBeTypeOf("number");
  });

  it("marks a case failed when a check fails", async () => {
    const failing = await runEvalCase({
      id: "synthetic.fail",
      title: "Synthetic fail",
      category: "quality",
      description: "Forces a failed check",
      execute() {
        return {
          caseId: "synthetic.fail",
          passed: false,
          checks: [
            makeCheck("always_fail", "Forced failure", true, false, false),
          ],
          metrics: {},
        };
      },
    });

    expect(failing.passed).toBe(false);
    expect(failing.checks[0]?.passed).toBe(false);
  });

  it("does not hard-code suite pass counts", async () => {
    const qualityReport = await runEvalSuite(qualityCases());
    const reliabilityReport = await runEvalSuite(reliabilityCases());

    expect(qualityReport.totalCases).toBe(qualityCases().length);
    expect(reliabilityReport.totalCases).toBe(reliabilityCases().length);
    expect(qualityReport.passRate).not.toBeNaN();
  });

  it("exposes honest quoteSupportRate from the scorer", () => {
    const content = [
      fixtureSourceA.content,
      fixtureSourceB.content,
      fixtureSourceC.content,
    ].join("\n\n");
    const scored = scoreQuoteSupport({
      content,
      findings: fixtureAttemptedFindings,
    });

    expect(scored.metrics.quoteSupportRate).toBe(rate(3, 5));
    expect(scored.metrics.quoteSupportRate).toBe(0.6);
    expect(scored.metrics.quoteSupportRate).not.toBe(1);
  });
});
