import {
  isMcpSourceUrl,
  MCP_FIXTURE_NOTE,
  sourceDomainLabel,
  sourceEvidenceKind,
  sourcePrimaryLabel,
  sourceToolLabel,
  sourceToolTechnicalName,
} from "@/lib/research/source-display";

export function EvidenceBlock({
  claim,
  quote,
  sourceTitle,
  sourceUrl,
  toolName,
  detail,
}: {
  claim: string;
  quote?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  toolName?: string | null;
  detail?: string | null;
}) {
  const sourceLabel = sourceUrl
    ? isMcpSourceUrl(sourceUrl)
      ? sourcePrimaryLabel({
          title: sourceTitle?.trim() || sourceUrl,
          url: sourceUrl,
          toolName,
        })
      : sourceTitle?.trim() || sourceUrl
    : null;
  const kind = sourceUrl
    ? sourceEvidenceKind({ url: sourceUrl, toolName })
    : "other";
  const domain = sourceUrl ? sourceDomainLabel(sourceUrl) : null;
  const toolLabel = sourceToolLabel(toolName);
  const technical = sourceToolTechnicalName(toolName);

  return (
    <div className="space-y-2 text-sm">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">
          Claim
        </p>
        <p className="mt-0.5 font-medium">{claim}</p>
        {detail ? (
          <p className="mt-1 text-xs text-zinc-500">{detail}</p>
        ) : null}
      </div>
      {quote ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Quote
          </p>
          <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">“{quote}”</p>
        </div>
      ) : null}
      {sourceLabel ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Source
          </p>
          <p className="mt-0.5">{sourceLabel}</p>
          {kind === "web" || kind === "mcp" ? (
            <p className="mt-2 text-[11px] uppercase tracking-wide text-zinc-500">
              Source type
            </p>
          ) : null}
          {kind === "web" ? (
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Web source{domain ? ` · ${domain}` : ""}
            </p>
          ) : null}
          {kind === "mcp" ? (
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              {toolLabel ?? "Company Profile · MCP"}
              <span className="mt-0.5 block text-zinc-500">{MCP_FIXTURE_NOTE}</span>
            </p>
          ) : null}
          {sourceUrl && sourceLabel !== sourceUrl ? (
            <p className="mt-1 break-all text-xs text-zinc-500">
              {isMcpSourceUrl(sourceUrl) || !/^https?:\/\//i.test(sourceUrl) ? (
                sourceUrl
              ) : (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-700 underline underline-offset-2 dark:text-sky-400"
                >
                  {sourceUrl}
                </a>
              )}
            </p>
          ) : null}
          {toolLabel && kind !== "mcp" ? (
            <p className="mt-1 text-xs text-zinc-500">
              {toolLabel}
              {technical ? (
                <span className="text-zinc-400"> ({technical})</span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
