import { sanitizeSourceIds } from "@/lib/research/citations";
import { sanitizeReportCitations } from "@/lib/research/report";
import type { ResearchReport } from "@/lib/research/report";
import type { Source } from "@/lib/research/types";
import {
  allChecksPassed,
  makeCheck,
  rate,
  type ScorerOutput,
} from "../types";

export type CitationScoreInput = {
  sources: Source[];
  candidateIds: string[];
  inventedIds?: string[];
  inventedUrls?: string[];
  report?: ResearchReport;
};

function collectReportSourceIds(report: ResearchReport): string[] {
  return [
    ...report.keyFindings.flatMap((item) => item.sourceIds),
    ...report.comparisons.flatMap((item) => item.sourceIds),
    ...report.strengthsWeaknesses.flatMap((item) => item.sourceIds),
    ...report.conflicts.flatMap((item) => item.sourceIds),
  ];
}

/**
 * Score citation hygiene against project Sources.
 */
export function scoreCitationHygiene(input: CitationScoreInput): ScorerOutput {
  const allowed = new Set(input.sources.map((source) => source.id));
  const allowedUrls = new Set(input.sources.map((source) => source.url));
  const sanitized = sanitizeSourceIds(input.candidateIds, input.sources);

  const validCandidates = input.candidateIds.filter((id) => allowed.has(id));
  const inventedIds = input.inventedIds ?? [];
  const inventedUrls = input.inventedUrls ?? [];

  const inventedIdsRejected = inventedIds.every(
    (id) => !sanitized.includes(id),
  );
  const inventedUrlsRejected = inventedUrls.every(
    (url) => !allowedUrls.has(url) && !sanitized.includes(url),
  );

  let reportIds: string[] = [];
  let reportIdsValid = true;
  if (input.report) {
    const cleaned = sanitizeReportCitations(input.report, input.sources);
    reportIds = collectReportSourceIds(cleaned);
    reportIdsValid = reportIds.every((id) => allowed.has(id));
  }

  const citationValidityRate = rate(
    sanitized.filter((id) => allowed.has(id)).length,
    Math.max(sanitized.length, 1),
  );

  const hallucinatedAttempts = inventedIds.length + inventedUrls.length;
  const hallucinatedRejected =
    (inventedIdsRejected ? inventedIds.length : 0) +
    (inventedUrlsRejected ? inventedUrls.length : 0);
  const hallucinatedSourceRejectionRate = rate(
    hallucinatedRejected,
    Math.max(hallucinatedAttempts, 1),
  );

  const checks = [
    makeCheck(
      "citations.valid_ids_kept",
      "Valid project source IDs survive sanitisation",
      validCandidates.sort(),
      sanitized.filter((id) => validCandidates.includes(id)).sort(),
      validCandidates.every((id) => sanitized.includes(id)),
    ),
    makeCheck(
      "citations.invented_ids_rejected",
      "Invented source IDs must be rejected",
      true,
      inventedIdsRejected,
      inventedIdsRejected,
    ),
    makeCheck(
      "citations.invented_urls_rejected",
      "Invented URLs must not become citation IDs",
      true,
      inventedUrlsRejected,
      inventedUrlsRejected,
    ),
    makeCheck(
      "citations.only_project_ids",
      "Sanitised IDs must all belong to project Sources",
      true,
      sanitized.every((id) => allowed.has(id)),
      sanitized.every((id) => allowed.has(id)),
    ),
  ];

  if (input.report) {
    checks.push(
      makeCheck(
        "citations.report_ids_valid",
        "Sanitised report citations must only reference project Sources",
        true,
        reportIdsValid,
        reportIdsValid,
      ),
    );
  }

  return {
    checks,
    metrics: {
      citationValidityRate,
      hallucinatedSourceRejectionRate,
      sanitisedCitationCount: sanitized.length,
    },
  };
}

export function citationScorePassed(output: ScorerOutput): boolean {
  return allChecksPassed(output.checks);
}
