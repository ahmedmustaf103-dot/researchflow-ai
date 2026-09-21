import { MCP_COMPANY_PROFILE_TOOL_NAME } from "@/lib/tools/mcp/schemas";

export function isMcpSourceUrl(url: string): boolean {
  return url.startsWith("mcp://");
}

export function isMcpCompanyProfileTool(
  toolName: string | null | undefined,
): boolean {
  return toolName === MCP_COMPANY_PROFILE_TOOL_NAME;
}

/** Human label from mcp://company-profile/{domain} or persisted title. */
export function mcpCompanyDisplayName(
  url: string,
  title?: string | null,
): string {
  if (title && title.trim().length > 0) {
    return title.trim();
  }

  const match = /^mcp:\/\/company-profile\/([^/?#]+)/i.exec(url);
  if (!match?.[1]) {
    return "Company";
  }

  const host = match[1];
  const base = host.split(".")[0] ?? host;
  if (!base) {
    return "Company";
  }

  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Primary UI title for a Source row (does not change persisted data). */
export function sourcePrimaryLabel(source: {
  title: string;
  url: string;
  toolName?: string | null;
}): string {
  if (
    isMcpSourceUrl(source.url) ||
    isMcpCompanyProfileTool(source.toolName)
  ) {
    return `Company profile — ${mcpCompanyDisplayName(source.url, source.title)}`;
  }

  return source.title;
}

/** User-facing tool badge; MCP never leads with the raw tool id. */
export function sourceToolLabel(
  toolName: string | null | undefined,
): string | null {
  if (!toolName) {
    return null;
  }

  if (isMcpCompanyProfileTool(toolName)) {
    return "Company Profile · MCP";
  }

  if (toolName === "search") {
    return "Web search";
  }

  if (toolName === "fetch_page") {
    return "Page retrieval";
  }

  return toolName;
}

export function sourceToolTechnicalName(
  toolName: string | null | undefined,
): string | null {
  if (!toolName || !isMcpCompanyProfileTool(toolName)) {
    return null;
  }

  return toolName;
}
