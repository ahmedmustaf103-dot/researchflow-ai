/**
 * Deterministic Phase 4 evaluation fixtures.
 *
 * Demo/test data only for offline evaluations.
 * Not live company research and not live API results.
 */

import type { ResearchReport } from "@/lib/research/report";
import type { ExtractedEvidenceFinding } from "@/lib/research/extract";
import type { Source } from "@/lib/research/types";

export const EVAL_RESEARCH_QUESTION =
  "Compare Stripe, Adyen and PayPal as payment platforms.";

export const fixtureSourceA: Source = {
  id: "src_eval_stripe",
  projectId: "proj_eval",
  taskId: null,
  url: "https://example.test/stripe-pricing",
  title: "Stripe pricing notes (eval fixture)",
  snippet: "Fixture snippet about Stripe pricing.",
  content:
    "Stripe charges 2.9% + 30¢ per successful card charge for standard online payments in the United States.",
  contentHash: "hash_stripe",
  httpStatus: 200,
  toolName: "fetch_page",
  fetchedAt: new Date("2024-01-01T00:00:00.000Z"),
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
};

export const fixtureSourceB: Source = {
  id: "src_eval_adyen",
  projectId: "proj_eval",
  taskId: null,
  url: "https://example.test/adyen-pricing",
  title: "Adyen pricing notes (eval fixture)",
  snippet: "Fixture snippet about Adyen pricing.",
  content:
    "Adyen typically uses interchange++ pricing for enterprise merchants rather than a flat blended consumer rate.",
  contentHash: "hash_adyen",
  httpStatus: 200,
  toolName: "fetch_page",
  fetchedAt: new Date("2024-01-01T00:00:00.000Z"),
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
};

export const fixtureSourceC: Source = {
  id: "src_eval_paypal",
  projectId: "proj_eval",
  taskId: null,
  url: "https://example.test/paypal-pricing",
  title: "PayPal pricing notes (eval fixture)",
  snippet: "Fixture snippet about PayPal pricing.",
  content:
    "PayPal charges 2.99% + fixed fee for many commercial transactions, and wallet checkout is widely recognised by consumers.",
  contentHash: "hash_paypal",
  httpStatus: 200,
  toolName: "fetch_page",
  fetchedAt: new Date("2024-01-01T00:00:00.000Z"),
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
};

export const fixtureSources: Source[] = [
  fixtureSourceA,
  fixtureSourceB,
  fixtureSourceC,
];

/** Mix of supported and unsupported quotes for rate measurement. */
export const fixtureAttemptedFindings: ExtractedEvidenceFinding[] = [
  {
    claim: "Stripe uses a percentage-plus-fixed fee model",
    quote:
      "Stripe charges 2.9% + 30¢ per successful card charge for standard online payments in the United States.",
    relevance: "pricing",
  },
  {
    claim: "Adyen uses interchange++ for enterprises",
    quote:
      "Adyen typically uses interchange++ pricing for enterprise merchants rather than a flat blended consumer rate.",
    relevance: "pricing",
  },
  {
    claim: "PayPal is well known to consumers",
    quote:
      "wallet checkout is widely recognised by consumers.",
    relevance: "brand",
  },
  {
    claim: "Stripe secretly charges 12% flat",
    quote: "Stripe secretly charges a flat 12% on every transaction worldwide.",
    relevance: "pricing",
  },
  {
    claim: "Adyen abandoned card payments",
    quote: "Adyen no longer supports card payments in any market.",
    relevance: "products",
  },
];

export const fixtureHallucinatedQuote =
  "PayPal acquired Adyen in a confidential all-cash transaction last quarter.";

/** Opposing claims about the same subject for conflict evaluation. */
export const opposingFindingA = {
  subject: "evidence",
  attribute: "pricing",
  value: "Stripe standard online pricing is 2.9% + 30¢",
  quote:
    "Stripe charges 2.9% + 30¢ per successful card charge for standard online payments in the United States.",
  sourceId: fixtureSourceA.id,
};

export const opposingFindingB = {
  subject: "evidence",
  attribute: "pricing",
  value: "Stripe standard online pricing is described as interchange++ only",
  quote:
    "Adyen typically uses interchange++ pricing for enterprise merchants rather than a flat blended consumer rate.",
  sourceId: fixtureSourceB.id,
};

export const fixtureConflictAnalysis = {
  summary:
    "Fixture analysis comparing Stripe, Adyen, and PayPal pricing models.",
  comparisons: [
    {
      dimension: "pricing",
      points: [
        "Stripe publishes a blended consumer rate in the fixture.",
        "Adyen emphasises interchange++ for enterprises in the fixture.",
      ],
    },
  ],
  similarities: ["All three process online payments in the fixture dataset."],
  differences: [
    "Published pricing presentation differs across the fixture sources.",
  ],
  gaps: ["Fixture dataset does not include live FX or regional fee tables."],
  uncertainties: [
    "Fixture pricing notes may not reflect negotiated enterprise contracts.",
  ],
  conflicts: [
    {
      topic: "How Stripe-like blended pricing compares to interchange++",
      statements: [
        opposingFindingA.value,
        "Enterprise-oriented interchange++ is presented as an alternative model in the Adyen fixture.",
      ],
    },
  ],
};

export const fixtureDirtyReport: ResearchReport = {
  title: "Payment platform comparison (eval fixture)",
  executiveSummary: "Fixture report summary.",
  scope: "Offline eval fixtures only.",
  keyFindings: [
    {
      text: "Stripe publishes a blended rate in the fixture.",
      sourceIds: [fixtureSourceA.id, "src_invented", "https://hallucinated.example/x"],
    },
  ],
  comparisons: [
    {
      dimension: "pricing",
      points: ["Adyen fixture emphasises interchange++."],
      sourceIds: [fixtureSourceB.id, "S999"],
    },
  ],
  strengthsWeaknesses: [
    {
      subject: "PayPal",
      strengths: ["Consumer recognition in the fixture."],
      weaknesses: ["Fee clarity varies by product in the fixture."],
      sourceIds: [fixtureSourceC.id],
    },
  ],
  gaps: ["No live fee schedule."],
  uncertainties: ["Enterprise discounts unknown in fixtures."],
  conflicts: [
    {
      topic: "Pricing presentation",
      statements: [
        opposingFindingA.value,
        "Adyen fixture emphasises interchange++.",
      ],
      sourceIds: [fixtureSourceA.id, fixtureSourceB.id, "src_fake"],
    },
  ],
};

export const fixturePlanGoal =
  "Compare Stripe, Adyen, and PayPal across pricing, products, and customer fit using fixture evidence.";

export const fixturePlanTasks = [
  {
    title: "Map pricing models",
    query: "Stripe Adyen PayPal pricing models comparison",
    sortOrder: 1,
  },
  {
    title: "Compare products",
    query: "Stripe Adyen PayPal product capabilities",
    sortOrder: 2,
  },
  {
    title: "Compare target customers",
    query: "Stripe Adyen PayPal target customers",
    sortOrder: 3,
  },
];
