import { ANALYSE_SYSTEM_PROMPT } from "@/lib/ai/prompts/analyse";
import { EXTRACT_SYSTEM_PROMPT } from "@/lib/ai/prompts/extract";
import { REPORT_SYSTEM_PROMPT } from "@/lib/ai/prompts/report";
import { scoreCitationHygiene } from "../scorers/citations";
import { scoreHallucinatedQuoteRejection } from "../scorers/extract";
import { scoreConflictDetection } from "../scorers/pipeline";
import {
  allChecksPassed,
  makeCheck,
  type EvalCase,
  type EvalResult,
} from "../types";
import {
  claimStaysWithinQuote,
  selectVerifiedFindings,
} from "@/lib/research/extract";
import type { ResearchReport } from "@/lib/research/report";
import type { Source } from "@/lib/research/types";
import { formatCompanyProfileContent, lookupCompanyProfile } from "@/lib/tools/mcp";

const PAGE =
  "Marina Gate is a residential development in Dubai Marina with a pool and gym.";

function result(
  caseId: string,
  checks: EvalResult["checks"],
  metrics: EvalResult["metrics"] = {},
): EvalResult {
  return {
    caseId,
    passed: allChecksPassed(checks),
    checks,
    metrics,
  };
}

const webSource: Source = {
  id: "src_marina",
  projectId: "proj_eval",
  taskId: null,
  url: "https://example.test/marina-gate",
  title: "Marina Gate public description",
  snippet: "Fixture page.",
  content: PAGE,
  contentHash: "hash",
  httpStatus: 200,
  toolName: "fetch_page",
  fetchedAt: new Date("2024-01-01T00:00:00.000Z"),
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
};

const dirtyReport: ResearchReport = {
  title: "Dubai Marina comparison",
  executiveSummary: "Sourced description only.",
  scope: "Public pages.",
  keyFindings: [
    {
      text: "Marina Gate is in Dubai Marina.",
      sourceIds: [webSource.id, "src_invented_price"],
    },
  ],
  comparisons: [],
  strengthsWeaknesses: [],
  gaps: ["Unit prices were not in the retrieved page."],
  uncertainties: [],
  conflicts: [],
};

export const realEstateEvalCases: EvalCase[] = [
  {
    id: "real-estate.unsupported-price",
    title: "Unsupported property price is rejected",
    category: "quality",
    description:
      "A price quote that is not in the retrieved page must be rejected.",
    execute() {
      const scored = scoreHallucinatedQuoteRejection({
        content: PAGE,
        hallucinatedQuote: "Marina Gate is priced from AED 2,000,000.",
        claim: "Marina Gate is priced from AED 2,000,000.",
      });
      return result("real-estate.unsupported-price", scored.checks, scored.metrics);
    },
  },
  {
    id: "real-estate.unsupported-yield",
    title: "Unsupported yield is rejected",
    category: "quality",
    description:
      "A yield added on top of a real quote must not become a finding.",
    execute() {
      const quote = "Marina Gate is a residential development in Dubai Marina";
      const claim = "Marina Gate offers an 8% yield.";
      const accepted = selectVerifiedFindings(
        [{ claim, quote, relevance: "return" }],
        PAGE,
        webSource.id,
      );
      return result("real-estate.unsupported-yield", [
        makeCheck(
          "real-estate.yield_not_in_quote",
          "Yield language must not be accepted when the quote does not state it",
          false,
          claimStaysWithinQuote(claim, quote),
          claimStaysWithinQuote(claim, quote) === false,
        ),
        makeCheck(
          "real-estate.yield_rejected",
          "Verification drops the ungrounded yield claim",
          0,
          accepted.length,
          accepted.length === 0,
        ),
      ]);
    },
  },
  {
    id: "real-estate.missing-specification",
    title: "Missing specification is not extracted",
    category: "quality",
    description:
      "A unit size that the page does not state must be rejected, and prompts send missing specifications to gaps.",
    execute() {
      const accepted = selectVerifiedFindings(
        [
          {
            claim: "Marina Gate units are 85 square metres.",
            quote: "Units start at 85 square metres.",
            relevance: "size",
          },
        ],
        PAGE,
        webSource.id,
      );
      return result("real-estate.missing-specification", [
        makeCheck(
          "real-estate.size_rejected",
          "A specification absent from the page is not stored",
          0,
          accepted.length,
          accepted.length === 0,
        ),
        makeCheck(
          "real-estate.prompt_gaps",
          "Report prompt sends missing prices and specifications to gaps",
          true,
          REPORT_SYSTEM_PROMPT.includes(
            "Put missing prices and specifications in gaps.",
          ),
          REPORT_SYSTEM_PROMPT.includes(
            "Put missing prices and specifications in gaps.",
          ),
        ),
      ]);
    },
  },
  {
    id: "real-estate.conflicting-sources",
    title: "Conflicting property descriptions stay conflicts",
    category: "quality",
    description:
      "Disagreement about a handover description is kept as a conflict.",
    execute() {
      const scored = scoreConflictDetection({
        expectConflict: true,
        analysisConflicts: [
          {
            topic: "Handover description",
            statements: [
              "One page describes Marina Gate as completed.",
              "Another page describes Marina Gate as under construction.",
            ],
          },
        ],
      });
      return result(
        "real-estate.conflicting-sources",
        [
          ...scored.checks,
          makeCheck(
            "real-estate.analyse_keeps_conflicts",
            "Analysis prompt records disagreements instead of choosing one",
            true,
            ANALYSE_SYSTEM_PROMPT.includes("record a conflict"),
            ANALYSE_SYSTEM_PROMPT.includes("record a conflict"),
          ),
        ],
        scored.metrics,
      );
    },
  },
  {
    id: "real-estate.citation-mismatch",
    title: "Invented property citation is removed",
    category: "quality",
    description:
      "A citation that is not a persisted source is stripped from the report.",
    execute() {
      const scored = scoreCitationHygiene({
        sources: [webSource],
        candidateIds: [webSource.id, "src_invented_price"],
        inventedIds: ["src_invented_price"],
        report: dirtyReport,
      });
      return result(
        "real-estate.citation-mismatch",
        scored.checks,
        scored.metrics,
      );
    },
  },
  {
    id: "real-estate.mcp-fixture-disclaimer",
    title: "Developer fixture states it is local demo data",
    category: "quality",
    description:
      "Emaar, DAMAC Properties, and Select Group profiles keep the fixture disclaimer and do not include prices.",
    execute() {
      const domains = ["emaar.com", "damacproperties.com", "select-group.ae"];
      const checks = domains.flatMap((domain) => {
        const lookup = lookupCompanyProfile({ domain });
        const content =
          lookup.ok ? formatCompanyProfileContent(lookup.profile) : "";
        const notes = lookup.ok ? lookup.profile.pricingNotes.join(" ") : "";
        return [
          makeCheck(
            `real-estate.fixture_found.${domain}`,
            `${domain} resolves as a local fixture`,
            true,
            lookup.ok,
            lookup.ok,
          ),
          makeCheck(
            `real-estate.fixture_disclaimer.${domain}`,
            `${domain} content says it is not a live company-data API`,
            true,
            content.includes("not a live company-data API response"),
            content.includes("not a live company-data API response"),
          ),
          makeCheck(
            `real-estate.fixture_no_price.${domain}`,
            `${domain} pricing notes do not include a numeric price`,
            true,
            !/\d/.test(notes),
            !/\d/.test(notes),
          ),
        ];
      });
      return result("real-estate.mcp-fixture-disclaimer", checks);
    },
  },
  {
    id: "real-estate.evidence-vs-interpretation",
    title: "Interpretation is not stored as a sourced fact",
    category: "quality",
    description:
      "A supported description must not be expanded into an investment conclusion.",
    execute() {
      const quote = "Marina Gate is a residential development in Dubai Marina";
      const claim = "Marina Gate is a buy recommendation.";
      const accepted = selectVerifiedFindings(
        [{ claim, quote, relevance: "advice" }],
        PAGE,
        webSource.id,
      );
      return result("real-estate.evidence-vs-interpretation", [
        makeCheck(
          "real-estate.advice_not_in_quote",
          "Advice language absent from the quote fails the claim check",
          false,
          claimStaysWithinQuote(claim, quote),
          claimStaysWithinQuote(claim, quote) === false,
        ),
        makeCheck(
          "real-estate.advice_rejected",
          "Verification does not store the investment conclusion",
          0,
          accepted.length,
          accepted.length === 0,
        ),
        makeCheck(
          "real-estate.extract_prompt",
          "Extraction prompt forbids turning an inference into a finding",
          true,
          EXTRACT_SYSTEM_PROMPT.includes(
            "Do not turn an inference into a factual finding.",
          ),
          EXTRACT_SYSTEM_PROMPT.includes(
            "Do not turn an inference into a factual finding.",
          ),
        ),
      ]);
    },
  },
];
