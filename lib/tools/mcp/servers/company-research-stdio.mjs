import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * Self-contained stdio MCP server entry.
 * Fixture-backed company profiles for portfolio/demo use only — not a live API.
 */

const fixturesPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/companies.json",
);

/** @type {Record<string, object>} */
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8"));

function normalizeDomain(domain) {
  return String(domain).trim().toLowerCase().replace(/^www\./, "");
}

const server = new McpServer({
  name: "company-research",
  version: "1.0.0",
});

server.registerTool(
  "lookup_company_profile",
  {
    title: "Lookup company profile",
    description:
      "Look up a structured company profile by domain from deterministic local fixtures (portfolio/demo provider).",
    inputSchema: {
      domain: z
        .string()
        .trim()
        .min(1)
        .describe("Company domain, e.g. stripe.com"),
    },
    outputSchema: {
      domain: z.string(),
      name: z.string(),
      summary: z.string(),
      products: z.array(z.string()),
      targetCustomers: z.array(z.string()),
      pricingNotes: z.array(z.string()),
      strengths: z.array(z.string()),
      sources: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
        }),
      ),
    },
  },
  async ({ domain }) => {
    const normalized = normalizeDomain(domain);
    if (!normalized) {
      return {
        isError: true,
        content: [{ type: "text", text: "domain must not be empty" }],
      };
    }

    const profile = fixtures[normalized];
    if (!profile) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown company domain: ${normalized}`,
          },
        ],
      };
    }

    const structuredContent = { ...profile, domain: normalized };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(structuredContent),
        },
      ],
      structuredContent,
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  "[mcp company-research] fixture-backed server listening on stdio",
);
