import { describe, expect, it } from "vitest";
import { createGeminiProvider } from "@/lib/ai/gemini";
import {
  extractEvidenceFromSource,
  quoteExistsInSource,
} from "@/lib/research/extract";
import type { Source } from "@/lib/research/types";

const enabled = process.env.LIVE_API_TESTS === "1";

describe.skipIf(!enabled)("live Gemini extraction", () => {
  it("extracts quote-backed findings or an empty list", async () => {
    const source: Source = {
      id: "src_live",
      projectId: "proj_live",
      taskId: null,
      url: "https://example.com/competitors",
      title: "Competitor landscape",
      snippet: null,
      content:
        "Adyen, PayPal, and Square are frequently cited as Stripe competitors.",
      contentHash: null,
      httpStatus: 200,
      toolName: "fetch_page",
      fetchedAt: new Date(),
      createdAt: new Date(),
    };

    const findings = await extractEvidenceFromSource({
      question:
        "Research the top competitors of Stripe and compare their pricing and features.",
      source,
      llm: createGeminiProvider(),
    });

    expect(Array.isArray(findings)).toBe(true);
    for (const finding of findings) {
      expect(finding.sourceId).toBe(source.id);
      expect(finding.quote.trim().length).toBeGreaterThan(0);
      expect(quoteExistsInSource(finding.quote, source.content ?? "")).toBe(true);
    }
  }, 60_000);
});
