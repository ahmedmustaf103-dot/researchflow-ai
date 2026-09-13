import { describe, expect, it } from "vitest";
import { createGeminiProvider } from "@/lib/ai/gemini";
import { analyseResearch } from "@/lib/research/analyse";
import { generateCitationBackedReport } from "@/lib/research/report";
import type { Finding, Source } from "@/lib/research/types";

const enabled = process.env.LIVE_API_TESTS === "1";

const source: Source = {
  id: "src_live",
  projectId: "proj_live",
  taskId: null,
  url: "https://example.com/competitors",
  title: "Competitor landscape",
  snippet: null,
  content: "Adyen, PayPal, and Square are frequently cited as Stripe competitors.",
  contentHash: null,
  httpStatus: 200,
  toolName: "fetch_page",
  fetchedAt: new Date(),
  createdAt: new Date(),
};

const finding: Finding = {
  id: "find_live",
  projectId: "proj_live",
  sourceId: source.id,
  subject: "evidence",
  attribute: "Names Stripe competitors",
  value: "Adyen, PayPal, and Square compete with Stripe.",
  quote: "Adyen, PayPal, and Square are frequently cited as Stripe competitors.",
  confidence: 1,
  createdAt: new Date(),
};

describe.skipIf(!enabled)("live Gemini analysis and report", () => {
  it("returns structured analysis and a citation-safe report", async () => {
    const llm = createGeminiProvider();
    const analysis = await analyseResearch({
      question:
        "Research the top competitors of Stripe and compare their pricing and features.",
      findings: [finding],
      sources: [source],
      llm,
    });

    expect(analysis.summary.trim().length).toBeGreaterThan(0);

    const report = await generateCitationBackedReport({
      question:
        "Research the top competitors of Stripe and compare their pricing and features.",
      analysis,
      findings: [finding],
      sources: [source],
      llm,
    });

    expect(report.markdown).toContain("## Sources");
    expect(report.markdown).not.toContain("https://hallucinated.example");
    if (report.markdown.includes("http")) {
      expect(report.markdown).toContain(source.url);
    }
  }, 90_000);
});
