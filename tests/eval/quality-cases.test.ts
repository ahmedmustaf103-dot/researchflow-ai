import { describe, expect, it } from "vitest";
import {
  qualityCases,
  runEvalCase,
  runEvalSuite,
  scoreCitationHygiene,
  scoreHallucinatedQuoteRejection,
  scoreQuoteSupport,
} from "@/lib/eval";
import {
  fixtureAttemptedFindings,
  fixtureDirtyReport,
  fixtureHallucinatedQuote,
  fixtureSourceA,
  fixtureSourceB,
  fixtureSourceC,
  fixtureSources,
} from "@/lib/eval/cases/fixtures";
import { selectVerifiedFindings } from "@/lib/research/extract";

describe("quality evaluation cases", () => {
  it("passes the quality suite", async () => {
    const report = await runEvalSuite(qualityCases());
    const failed = report.results.filter((result) => !result.passed);

    expect(failed).toEqual([]);
    expect(report.passRate).toBe(1);
  });

  it("plan.constraints enforces sort order and task clamp", async () => {
    const result = await runEvalCase(
      qualityCases().find((item) => item.id === "plan.constraints")!,
    );

    expect(result.passed).toBe(true);
    expect(result.metrics.planConstraintRate).toBe(1);
    expect(result.metrics.taskCount).toBe(6);
  });

  it("extract.quote-support reports 0.6 for the mixed fixture set", async () => {
    const result = await runEvalCase(
      qualityCases().find((item) => item.id === "extract.quote-support")!,
    );

    expect(result.metrics.quoteSupportRate).toBe(0.6);
    expect(result.metrics.supportedFindings).toBe(3);
    expect(result.metrics.unsupportedFindings).toBe(2);
    expect(result.passed).toBe(true);
  });

  it("negative: unsupported quotes lower quoteSupportRate", () => {
    const content = fixtureSourceA.content ?? "";
    const scored = scoreQuoteSupport({
      content,
      findings: fixtureAttemptedFindings,
    });

    // Only the Stripe-supported quote matches source A content alone.
    expect(scored.metrics.quoteSupportRate).toBeLessThan(1);
    expect(scored.metrics.supportedFindings).toBe(1);
    expect(scored.metrics.unsupportedFindings).toBe(4);
  });

  it("negative: hallucinated quote is rejected", () => {
    const scored = scoreHallucinatedQuoteRejection({
      content: fixtureSourceC.content ?? "",
      hallucinatedQuote: fixtureHallucinatedQuote,
    });

    expect(scored.metrics.hallucinatedSourceRejectionRate).toBe(1);
    expect(
      selectVerifiedFindings(
        [
          {
            claim: "fake",
            quote: fixtureHallucinatedQuote,
            relevance: "eval",
          },
        ],
        fixtureSourceC.content ?? "",
        "src",
      ),
    ).toHaveLength(0);
  });

  it("negative: invented URLs and IDs are rejected by citation scorer", () => {
    const scored = scoreCitationHygiene({
      sources: fixtureSources,
      candidateIds: [
        fixtureSourceA.id,
        "src_invented",
        "https://hallucinated.example/x",
      ],
      inventedIds: ["src_invented"],
      inventedUrls: ["https://hallucinated.example/x"],
      report: fixtureDirtyReport,
    });

    expect(scored.metrics.hallucinatedSourceRejectionRate).toBe(1);
    expect(
      scored.checks.find((check) => check.id === "citations.invented_ids_rejected")
        ?.passed,
    ).toBe(true);
    expect(
      scored.checks.find((check) => check.id === "citations.invented_urls_rejected")
        ?.passed,
    ).toBe(true);
  });

  it("conflicts.opposing-evidence detects fixture conflicts", async () => {
    const result = await runEvalCase(
      qualityCases().find((item) => item.id === "conflicts.opposing-evidence")!,
    );

    expect(result.passed).toBe(true);
    expect(result.metrics.conflictDetectionRate).toBe(1);
    expect(result.metrics.conflictCount).toBeGreaterThan(0);
  });

  it("mcp.failure-isolation creates no mcp:// Sources", async () => {
    const result = await runEvalCase(
      qualityCases().find((item) => item.id === "mcp.failure-isolation")!,
    );

    expect(result.passed).toBe(true);
    const fabrication = result.checks.find(
      (check) => check.id === "reliability.no_fabrication",
    );
    expect(fabrication?.passed).toBe(true);
  });

  it("includes Stripe/Adyen/PayPal fixture sources as demo data", () => {
    expect(fixtureSourceA.url).toContain("example.test");
    expect(fixtureSourceB.title).toContain("eval fixture");
    expect(fixtureSourceC.snippet).toContain("Fixture");
  });
});
