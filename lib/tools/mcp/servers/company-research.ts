import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { lookupCompanyProfile } from "../company-profile";
import {
  COMPANY_RESEARCH_SERVER_ID,
  LOOKUP_COMPANY_PROFILE_TOOL,
  companyProfileSchema,
} from "../schemas";

/**
 * Creates the company-research MCP server.
 * Tool data comes from local fixtures only — not a live external API.
 */
export function createCompanyResearchMcpServer(): McpServer {
  const server = new McpServer({
    name: COMPANY_RESEARCH_SERVER_ID,
    version: "1.0.0",
  });

  server.registerTool(
    LOOKUP_COMPANY_PROFILE_TOOL,
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
      const result = lookupCompanyProfile({ domain });

      if (!result.ok) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: result.error,
            },
          ],
        };
      }

      const profile = companyProfileSchema.parse(result.profile);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(profile),
          },
        ],
        structuredContent: profile,
      };
    },
  );

  return server;
}
