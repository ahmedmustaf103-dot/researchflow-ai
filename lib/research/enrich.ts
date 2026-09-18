import { createHash } from "node:crypto";
import type { MCPClient } from "@/lib/tools/mcp";
import {
  COMPANY_RESEARCH_SERVER_ID,
  LOOKUP_COMPANY_PROFILE_TOOL,
  MCP_COMPANY_PROFILE_TOOL_NAME,
  companyProfileSchema,
  companyProfileSourceUrl,
  type CompanyProfile,
} from "@/lib/tools/mcp/schemas";
import { formatCompanyProfileContent } from "@/lib/tools/mcp/company-profile";
import { selectDomainsFromSources } from "./domains";
import { MAX_MCP_ENRICH_DOMAINS } from "./limits";
import type { ResearchStore } from "./store";

function hashContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type EnrichResearchOptions = {
  projectId: string;
  store: ResearchStore;
  mcp: MCPClient;
  maxDomains?: number;
};

/**
 * Best-effort MCP enrichment stage.
 * The orchestrator selects domains and explicitly calls lookup_company_profile.
 * Gemini does not choose MCP tools. Failures never fail the whole project.
 */
export async function enrichResearchWithCompanyProfiles(
  options: EnrichResearchOptions,
): Promise<void> {
  const { projectId, store, mcp } = options;
  const maxDomains = options.maxDomains ?? MAX_MCP_ENRICH_DOMAINS;
  const sources = await store.listSources(projectId);
  const domains = selectDomainsFromSources(sources, maxDomains);

  if (domains.length === 0) {
    return;
  }

  for (const domain of domains) {
    try {
      const result = await mcp.callTool(
        COMPANY_RESEARCH_SERVER_ID,
        LOOKUP_COMPANY_PROFILE_TOOL,
        { domain },
      );

      if (!result.ok) {
        console.error(
          `[research enrich] MCP lookup failed project=${projectId} domain=${domain} error=${result.error}`,
        );
        continue;
      }

      const parsed = companyProfileSchema.safeParse(result.data);
      if (!parsed.success) {
        console.error(
          `[research enrich] invalid MCP payload project=${projectId} domain=${domain}`,
        );
        continue;
      }

      await persistCompanyProfileSource(store, projectId, parsed.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(
        `[research enrich] MCP lookup threw project=${projectId} domain=${domain} error=${message}`,
      );
    }
  }
}

async function persistCompanyProfileSource(
  store: ResearchStore,
  projectId: string,
  profile: CompanyProfile,
): Promise<void> {
  const url = companyProfileSourceUrl(profile.domain);
  const existing = await store.findSourceByUrl(projectId, url);
  if (existing) {
    return;
  }

  const content = formatCompanyProfileContent(profile);

  await store.createSource({
    projectId,
    url,
    title: profile.name,
    snippet: profile.summary,
    content,
    contentHash: hashContent(content),
    httpStatus: 200,
    toolName: MCP_COMPANY_PROFILE_TOOL_NAME,
    fetchedAt: new Date(),
  });
}
