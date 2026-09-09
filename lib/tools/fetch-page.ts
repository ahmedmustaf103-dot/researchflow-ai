import { z } from "zod";
import type { InternalTool } from "@/lib/tools/types";
import type { FetchedPage } from "@/lib/research/types";

export const fetchPageInputSchema = z.object({
  url: z.string().url(),
});

export type FetchPageInput = z.infer<typeof fetchPageInputSchema>;

export const mockFetchPageTool: InternalTool<FetchPageInput, FetchedPage> = {
  source: "internal",
  name: "fetch_page",
  description: "Mock page fetch that returns deterministic fake content.",
  inputSchema: fetchPageInputSchema,
  async execute(input) {
    const pages: Record<string, FetchedPage> = {
      "https://example.com/competitors": {
        url: input.url,
        title: "Mock competitor landscape",
        httpStatus: 200,
        content:
          "Adyen, PayPal, and Square are frequently cited as Stripe competitors. Adyen focuses on enterprise acquiring. PayPal is strong with consumers and SMBs. Square (Block) targets in-person commerce.",
      },
      "https://example.com/pricing": {
        url: input.url,
        title: "Mock pricing comparison",
        httpStatus: 200,
        content:
          "Stripe typically charges around 2.9% + 30¢ per successful card charge in the US. PayPal consumer checkout is often similar. Adyen uses interchange++ for larger merchants. Square also uses a flat-rate model for smaller sellers.",
      },
      "https://example.com/market": {
        url: input.url,
        title: "Mock market overview",
        httpStatus: 200,
        content:
          "The target market spans online platforms, marketplaces, and SaaS companies that need payments infrastructure. Strengths include developer experience for Stripe, global acquiring for Adyen, brand trust for PayPal, and offline-to-online for Square.",
      },
    };

    const page = pages[input.url] ?? {
      url: input.url,
      title: `Mock page for ${input.url}`,
      httpStatus: 200,
      content: `Deterministic mock content for ${input.url}.`,
    };

    return { ok: true, data: page };
  },
};
