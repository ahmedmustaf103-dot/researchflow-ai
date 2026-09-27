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

export const MCP_FIXTURE_NOTE =
  "Local demo fixture — not live company data";

export function sourceDomainLabel(url: string): string | null {
  if (isMcpSourceUrl(url)) {
    const match = /^mcp:\/\/company-profile\/([^/?#]+)/i.exec(url);
    return match?.[1] ?? null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    const hostname = parsed.hostname.trim().toLowerCase();
    return hostname ? hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/** Web evidence and MCP fixtures must not look like the same kind of source. */
export function sourceEvidenceKind(source: {
  url: string;
  toolName?: string | null;
}): "web" | "mcp" | "other" {
  if (isMcpSourceUrl(source.url) || isMcpCompanyProfileTool(source.toolName)) {
    return "mcp";
  }
  if (/^https?:\/\//i.test(source.url)) {
    return "web";
  }
  return "other";
}

export function sourceToolTechnicalName(
  toolName: string | null | undefined,
): string | null {
  if (!toolName || !isMcpCompanyProfileTool(toolName)) {
    return null;
  }

  return toolName;
}
