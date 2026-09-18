import { createToolRegistry } from "./registry";
import { mockFetchPageTool } from "./fetch-page";
import { mockSearchTool } from "./search";
import {
  COMPANY_RESEARCH_SERVER_ID,
  LOOKUP_COMPANY_PROFILE_TOOL,
} from "./mcp/schemas";

export function createMockToolRegistry() {
  const registry = createToolRegistry();
  registry.registerInternal(mockSearchTool);
  registry.registerInternal(mockFetchPageTool);
  registry.registerMcp({
    source: "mcp",
    serverId: COMPANY_RESEARCH_SERVER_ID,
    name: LOOKUP_COMPANY_PROFILE_TOOL,
    description:
      "Look up a structured company profile by domain from deterministic local fixtures.",
    inputSchema: {
      type: "object",
      required: ["domain"],
      properties: {
        domain: { type: "string", minLength: 1 },
      },
    },
  });
  return registry;
}
