import { MAX_MCP_ENRICH_DOMAINS } from "./limits";
import type { Source } from "./types";

/**
 * Derive company domains from persisted HTTP(S) Sources.
 * Domains are selected by application code only — never by the LLM.
 */
export function selectDomainsFromSources(
  sources: Source[],
  limit = MAX_MCP_ENRICH_DOMAINS,
): string[] {
  const seen = new Set<string>();
  const domains: string[] = [];

  for (const source of sources) {
    const domain = hostnameFromUrl(source.url);
    if (!domain || seen.has(domain)) {
      continue;
    }
    seen.add(domain);
    domains.push(domain);
    if (domains.length >= limit) {
      break;
    }
  }

  return domains;
}

export function hostnameFromUrl(rawUrl: string): string | null {
  if (!rawUrl || rawUrl.startsWith("mcp://")) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const hostname = parsed.hostname.trim().toLowerCase();
    if (!hostname) {
      return null;
    }

    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
