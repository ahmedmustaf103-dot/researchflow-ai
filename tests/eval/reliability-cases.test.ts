import { describe, expect, it } from "vitest";
import {
  reliabilityCases,
  runEvalCase,
  runEvalSuite,
  scoreRetryBudget,
} from "@/lib/eval";
import { MAX_SEARCH_RETRIES } from "@/lib/research/limits";

describe("reliability evaluation cases", () => {
  it("passes the reliability suite", async () => {
    const report = await runEvalSuite(reliabilityCases());
    const failed = report.results.filter((result) => !result.passed);

    expect(failed).toEqual([]);
    expect(report.passRate).toBe(1);
    expect(report.metrics.reliabilityPassRate).toBe(1);
  });

  it("search retry then success stays within budget", async () => {
    const result = await runEvalCase(
      reliabilityCases().find(
        (item) => item.id === "reliability.search-retry-then-success",
      )!,
    );

    expect(result.passed).toBe(true);
    expect(result.metrics.attempts).toBe(2);
    expect(result.metrics.attempts).toBeLessThanOrEqual(MAX_SEARCH_RETRIES + 1);
  });

  it("auth failure is attempted once and non-retryable", async () => {
    const result = await runEvalCase(
      reliabilityCases().find(
        (item) => item.id === "reliability.search-auth-no-retry",
      )!,
    );

    expect(result.passed).toBe(true);
    expect(result.metrics.attempts).toBe(1);
    expect(
      result.checks.find((check) => check.id === "reliability.auth_not_retryable")
        ?.passed,
    ).toBe(true);
  });

  it("timeout exhausts the retry budget", async () => {
    const result = await runEvalCase(
      reliabilityCases().find(
        (item) => item.id === "reliability.search-timeout-budget",
      )!,
    );

    expect(result.passed).toBe(true);
    expect(result.metrics.attempts).toBe(MAX_SEARCH_RETRIES + 1);
  });

  it("negative: exceeding retry budget fails the scorer", () => {
    const scored = scoreRetryBudget({
      attempts: MAX_SEARCH_RETRIES + 5,
      maxAttempts: MAX_SEARCH_RETRIES + 1,
      succeeded: false,
    });

    expect(scored.checks.some((check) => !check.passed)).toBe(true);
    expect(scored.metrics.reliabilityPassRate).toBeLessThan(1);
  });

  it("all-search failure fails the project without a report", async () => {
    const result = await runEvalCase(
      reliabilityCases().find(
        (item) => item.id === "reliability.all-search-failure",
      )!,
    );

    expect(result.passed).toBe(true);
    expect(
      result.checks.find((check) => check.id === "reliability.project_status")
        ?.actual,
    ).toBe("failed");
    expect(
      result.checks.find((check) => check.id === "reliability.report_rule")
        ?.actual,
    ).toBe(false);
  });

  it("partial retrieve preserves the Source row", async () => {
    const result = await runEvalCase(
      reliabilityCases().find(
        (item) => item.id === "reliability.partial-retrieve-preserves-source",
      )!,
    );

    expect(result.passed).toBe(true);
    expect(
      result.checks.find((check) => check.id === "reliability.source_url_preserved")
        ?.passed,
    ).toBe(true);
  });

  it("MCP failure does not fabricate Sources", async () => {
    const result = await runEvalCase(
      reliabilityCases().find(
        (item) => item.id === "reliability.mcp-failure-no-fabrication",
      )!,
    );

    expect(result.passed).toBe(true);
    expect(
      result.checks.find((check) => check.id === "reliability.no_fabrication")
        ?.passed,
    ).toBe(true);
  });
});
