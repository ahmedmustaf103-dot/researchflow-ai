import {
  quoteExistsInSource,
  selectVerifiedFindings,
  type ExtractedEvidenceFinding,
} from "@/lib/research/extract";
import {
  allChecksPassed,
  makeCheck,
  rate,
  type ScorerOutput,
} from "../types";

export type ExtractScoreInput = {
  content: string;
  findings: ExtractedEvidenceFinding[];
  sourceId?: string;
};

/**
 * Score quote support using the application's real verification helpers.
 * Supported / attempted is reported honestly (not forced to 1.0).
 */
export function scoreQuoteSupport(input: ExtractScoreInput): ScorerOutput {
  const attempted = input.findings.length;
  const supported = input.findings.filter((finding) =>
    quoteExistsInSource(finding.quote, input.content),
  );
  const unsupported = input.findings.filter(
    (finding) => !quoteExistsInSource(finding.quote, input.content),
  );

  const accepted = selectVerifiedFindings(
    input.findings,
    input.content,
    input.sourceId ?? "eval-source",
  );

  const quoteSupportRate = rate(supported.length, attempted);

  const checks = [
    makeCheck(
      "extract.attempted_count",
      "Count of attempted extracted findings",
      attempted,
      attempted,
      true,
    ),
    makeCheck(
      "extract.supported_count",
      "Findings whose quotes appear in source content",
      supported.length,
      supported.length,
      true,
    ),
    makeCheck(
      "extract.unsupported_rejected",
      "Unsupported quotes must not be accepted by selectVerifiedFindings",
      0,
      accepted.filter((finding) =>
        unsupported.some(
          (item) =>
            item.quote === finding.quote && item.claim === finding.claim,
        ),
      ).length,
      accepted.every((finding) =>
        quoteExistsInSource(finding.quote, input.content),
      ),
    ),
    makeCheck(
      "extract.accepted_equals_supported",
      "Accepted finding count equals supported quote count (after dedupe)",
      supported.length,
      accepted.length,
      accepted.length <= supported.length,
    ),
  ];

  return {
    checks,
    metrics: {
      quoteSupportRate,
      attemptedFindings: attempted,
      supportedFindings: supported.length,
      unsupportedFindings: unsupported.length,
      acceptedFindings: accepted.length,
    },
  };
}

/**
 * Assert that a known hallucinated quote is rejected.
 */
export function scoreHallucinatedQuoteRejection(input: {
  content: string;
  hallucinatedQuote: string;
  claim?: string;
}): ScorerOutput {
  const findings: ExtractedEvidenceFinding[] = [
    {
      claim: input.claim ?? "Hallucinated claim",
      quote: input.hallucinatedQuote,
      relevance: "eval fixture",
    },
  ];

  const accepted = selectVerifiedFindings(
    findings,
    input.content,
    "eval-source",
  );
  const exists = quoteExistsInSource(input.hallucinatedQuote, input.content);

  const checks = [
    makeCheck(
      "extract.hallucinated_not_in_source",
      "Hallucinated quote must not appear in fixture source content",
      false,
      exists,
      exists === false,
    ),
    makeCheck(
      "extract.hallucinated_rejected",
      "Hallucinated quote must be rejected by verification",
      0,
      accepted.length,
      accepted.length === 0,
    ),
  ];

  return {
    checks,
    metrics: {
      quoteSupportRate: rate(0, 1),
      hallucinatedSourceRejectionRate: accepted.length === 0 ? 1 : 0,
    },
  };
}

export function extractScorePassed(output: ScorerOutput): boolean {
  return allChecksPassed(output.checks);
}
