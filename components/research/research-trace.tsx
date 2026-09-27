"use client";

import { useState } from "react";
import type { ResearchStage } from "@/lib/research/types";
import type { ResearchTrace, TraceItemStatus } from "@/lib/research/trace-types";
import { EvidenceBlock } from "@/components/research/evidence-block";
import {
  isMcpSourceUrl,
  sourcePrimaryLabel,
  sourceToolLabel,
  sourceToolTechnicalName,
} from "@/lib/research/source-display";

const STATUS_LABEL: Record<TraceItemStatus, string> = {
  success: "success",
  failed: "failed",
  skipped: "skipped",
  rejected: "rejected",
  pending: "pending",
};

const STAGE_MEANING: Record<ResearchStage, string> = {
  plan: "Break the question into research tasks.",
  search: "Find relevant public sources.",
  retrieve: "Fetch source content.",
  enrich: "Add available company-profile context.",
  extract: "Identify evidence-backed findings.",
  verify: "Check extracted quotes against retrieved content.",
  analyse: "Compare and organise the evidence.",
  report: "Produce the citation-backed brief.",
};

const DEFAULT_OPEN = new Set(["plan", "extract", "report"]);

function initialOpenStages(trace: ResearchTrace): Record<string, boolean> {
  const open: Record<string, boolean> = {};
  for (const stage of trace.stages) {
    open[stage.id] =
      DEFAULT_OPEN.has(stage.id) ||
      stage.status === "pending" ||
      stage.status === "failed";
  }
  return open;
}

function statusClass(status: TraceItemStatus): string {
  switch (status) {
    case "success":
      return "text-emerald-700 dark:text-emerald-400";
    case "failed":
      return "text-red-600 dark:text-red-400";
    case "rejected":
      return "text-amber-700 dark:text-amber-400";
    case "skipped":
      return "text-zinc-500";
    case "pending":
      return "text-sky-700 dark:text-sky-400";
    default:
      return "text-zinc-500";
  }
}

function marker(status: TraceItemStatus): string {
  switch (status) {
    case "success":
      return "●";
    case "failed":
      return "✕";
    case "rejected":
      return "!";
    case "skipped":
      return "○";
    case "pending":
      return "…";
    default:
      return "○";
  }
}

function ItemUrl({ url }: { url: string; title?: string }) {
  if (isMcpSourceUrl(url)) {
    return (
      <p className="mt-1 break-all text-xs text-zinc-500">{url}</p>
    );
  }

  return (
    <p className="mt-1 break-all text-zinc-500">
      {/^https?:\/\//i.test(url) ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-sky-700 underline underline-offset-2 dark:text-sky-400"
        >
          {url}
        </a>
      ) : (
        url
      )}
    </p>
  );
}

function ToolDetail({ toolName }: { toolName: string | null | undefined }) {
  const label = sourceToolLabel(toolName);
  if (!label) {
    return null;
  }

  const technical = sourceToolTechnicalName(toolName);

  return (
    <p className="mt-1 text-xs text-zinc-500">
      Tool: {label}
      {technical ? (
        <span className="text-zinc-400"> ({technical})</span>
      ) : null}
    </p>
  );
}

export function ResearchTraceView({ trace }: { trace: ResearchTrace }) {
  const [openStages, setOpenStages] = useState<Record<string, boolean>>(() =>
    initialOpenStages(trace),
  );

  function toggle(stageId: string) {
    setOpenStages((current) => ({
      ...current,
      [stageId]: !current[stageId],
    }));
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">Research Trace</h2>
        <p className="text-sm text-zinc-500">
          Provenance from persisted project data. Events that were never stored
          (such as rejected quotes or failed MCP lookups) are not invented here.
        </p>
        {trace.errorMessage ? (
          <p className="text-sm text-red-600">Error: {trace.errorMessage}</p>
        ) : null}
      </div>

      <ol className="space-y-3 border-l border-zinc-200 pl-4 dark:border-zinc-800">
        {trace.stages.map((stage) => {
          const isOpen = Boolean(openStages[stage.id]);
          return (
            <li key={stage.id} className="relative">
              <button
                type="button"
                onClick={() => toggle(stage.id)}
                className="flex w-full items-start gap-3 text-left"
              >
                <span
                  className={`mt-0.5 text-sm ${statusClass(stage.status)}`}
                  aria-hidden
                >
                  {marker(stage.status)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{stage.label}</span>
                    <span
                      className={`text-xs uppercase tracking-wide ${statusClass(stage.status)}`}
                    >
                      {STATUS_LABEL[stage.status]}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">
                    {STAGE_MEANING[stage.id]}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {stage.summary}
                  </span>
                </span>
              </button>

              {isOpen ? (
                <div className="mt-3 space-y-4 pl-6">
                  {stage.items.length === 0 ? (
                    <p className="text-sm text-zinc-500">No items recorded.</p>
                  ) : (
                    <ul className="space-y-2">
                      {stage.items.map((item) => (
                        <li
                          key={item.id}
                          className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                        >
                          <div className="flex flex-wrap items-baseline gap-2">
                            {item.quote ? null : (
                              <span className="font-medium">
                                {item.url && isMcpSourceUrl(item.url)
                                  ? sourcePrimaryLabel({
                                      title: item.label,
                                      url: item.url,
                                      toolName: item.toolName,
                                    })
                                  : item.label}
                              </span>
                            )}
                            <span
                              className={`text-xs uppercase ${statusClass(item.status)}`}
                            >
                              {STATUS_LABEL[item.status]}
                            </span>
                          </div>
                          {item.quote ? (
                            <div className="mt-2">
                              <EvidenceBlock
                                claim={item.label}
                                quote={item.quote}
                                detail={item.detail}
                                sourceUrl={item.url}
                                toolName={item.toolName}
                              />
                            </div>
                          ) : item.detail ? (
                            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                              {item.detail}
                            </p>
                          ) : null}
                          {item.url && !item.quote ? (
                            <ItemUrl url={item.url} title={item.label} />
                          ) : null}
                          {item.quote ? null : (
                            <ToolDetail toolName={item.toolName} />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {stage.id === "extract" &&
                  trace.provenance.findings.length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Evidence provenance</h3>
                      <ul className="space-y-2">
                        {trace.provenance.findings.map((finding) => (
                          <li
                            key={finding.findingId}
                            className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                          >
                            <EvidenceBlock
                              claim={finding.claim}
                              quote={finding.quote}
                              sourceTitle={finding.sourceTitle}
                              sourceUrl={finding.sourceUrl}
                              toolName={finding.toolName}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {stage.id === "report" &&
                  trace.provenance.citations.length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Citation provenance</h3>
                      <ul className="space-y-2">
                        {trace.provenance.citations.map((citation) => (
                          <li
                            key={citation.sourceId}
                            className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                          >
                            <p className="font-medium">
                              {isMcpSourceUrl(citation.url)
                                ? sourcePrimaryLabel({
                                    title: citation.title,
                                    url: citation.url,
                                  })
                                : citation.title}
                            </p>
                            <ItemUrl url={citation.url} title={citation.title} />
                            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                              Cited in: {citation.citedIn.join(", ")}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
