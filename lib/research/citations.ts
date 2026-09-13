import type { Finding, Source } from "./types";
import { MAX_ANALYSIS_FINDINGS, MAX_ANALYSIS_QUOTE_CHARS } from "./limits";

export type SourceCatalogEntry = {
  ref: string;
  sourceId: string;
  title: string;
};

export function buildSourceCatalog(sources: Source[]): SourceCatalogEntry[] {
  return sources.map((source, index) => ({
    ref: `S${index + 1}`,
    sourceId: source.id,
    title: source.title,
  }));
}

export function formatSourceCatalog(catalog: SourceCatalogEntry[]): string {
  if (catalog.length === 0) {
    return "None";
  }

  return catalog
    .map((entry) => `${entry.ref}: ${entry.title}`)
    .join("\n");
}

export function allowedSourceIds(sources: Source[]): Set<string> {
  return new Set(sources.map((source) => source.id));
}

export function sanitizeSourceIds(
  ids: string[] | undefined,
  sources: Source[],
): string[] {
  const allowed = allowedSourceIds(sources);
  const refToId = new Map(
    buildSourceCatalog(sources).map((entry) => [entry.ref, entry.sourceId]),
  );
  const resolved: string[] = [];

  for (const raw of ids ?? []) {
    const candidate = raw.trim();
    const sourceId = allowed.has(candidate)
      ? candidate
      : refToId.get(candidate);

    if (!sourceId || !allowed.has(sourceId) || resolved.includes(sourceId)) {
      continue;
    }

    resolved.push(sourceId);
  }

  return resolved;
}

export function findingsForPrompt(
  findings: Finding[],
  catalog: SourceCatalogEntry[],
): string {
  const sourceIdToRef = new Map(
    catalog.map((entry) => [entry.sourceId, entry.ref]),
  );

  return findings
    .slice(0, MAX_ANALYSIS_FINDINGS)
    .map((finding, index) => {
      const ref = sourceIdToRef.get(finding.sourceId) ?? "unknown";
      const quote = finding.quote.slice(0, MAX_ANALYSIS_QUOTE_CHARS);
      return [
        `Finding ${index + 1}`,
        `Source: ${ref}`,
        `Claim: ${finding.value}`,
        `Relevance: ${finding.attribute}`,
        `Quote: ${quote}`,
      ].join("\n");
    })
    .join("\n\n");
}
