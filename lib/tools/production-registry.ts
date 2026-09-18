import { getEnv } from "@/lib/env";
import { createJinaFetchPageTool } from "./fetch-page/jina";
import { createToolRegistry } from "./registry";
import { createBraveSearchTool } from "./search/brave";
import {
  COMPANY_RESEARCH_SERVER_ID,
  LOOKUP_COMPANY_PROFILE_TOOL,
} from "./mcp/schemas";

/**
 * Production registry:
 * Internal: search (Brave), fetch_page (Jina)
 * MCP: lookup_company_profile (company-research server)
 *
 * MCP tools are registered for discovery/metadata only.
 * Execution goes through MCPClient.callTool — never InternalTool.execute.
 */
export function createProductionToolRegistry() {
  const env = getEnv();
  const registry = createToolRegistry();

  registry.registerInternal(
    createBraveSearchTool({
      apiKey: env.BRAVE_API_KEY,
    }),
  );
  registry.registerInternal(
    createJinaFetchPageTool({
      apiKey: env.JINA_API_KEY,
    }),
  );

  registry.registerMcp({
    source: "mcp",
    serverId: COMPANY_RESEARCH_SERVER_ID,
    name: LOOKUP_COMPANY_PROFILE_TOOL,
    description:
      "Look up a structured company profile by domain from deterministic local fixtures (portfolio/demo MCP provider).",
    inputSchema: {
      type: "object",
      required: ["domain"],
      properties: {
        domain: {
          type: "string",
          minLength: 1,
          description: "Company domain, e.g. stripe.com",
        },
      },
    },
  });

  return registry;
}
