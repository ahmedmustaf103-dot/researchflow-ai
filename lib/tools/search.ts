import { z } from "zod";
import type { InternalTool } from "@/lib/tools/types";
import type { SearchHit } from "@/lib/research/types";

export const searchInputSchema = z.object({
  query: z.string().min(1),
});

export type SearchInput = z.infer<typeof searchInputSchema>;

export type SearchOutput = {
  results: SearchHit[];
};

export const mockSearchTool: InternalTool<SearchInput, SearchOutput> = {
  source: "internal",
  name: "search",
  description: "Mock web search that returns deterministic fake results.",
  inputSchema: searchInputSchema,
  async execute(input) {
    const query = input.query.trim();

    return {
      ok: true,
      data: {
        results: [
          {
            url: "https://example.com/competitors",
            title: `Competitor landscape for: ${query}`,
            snippet: `Mock search result describing competitors related to "${query}".`,
          },
          {
            url: "https://example.com/pricing",
            title: `Pricing comparison for: ${query}`,
            snippet: "Mock pricing and packaging notes for comparable products.",
          },
          {
            url: "https://example.com/market",
            title: `Market overview for: ${query}`,
            snippet: "Mock market positioning, target customers, and trends.",
          },
        ],
      },
    };
  },
};
