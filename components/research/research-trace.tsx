"use client";

import { useState } from "react";
import type { ResearchTrace } from "@/lib/research/trace-types";
import type { TraceItemStatus } from "@/lib/research/trace-types";

const STATUS_LABEL: Record<TraceItemStatus, string> = {
  success: "success",
  failed: "failed",
  skipped: "skipped",
  rejected: "rejected",
  pending: "pending",
};

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

export function ResearchTraceView({ trace }: { trace: ResearchTrace }) {
  const [openStages, setOpenStages] = useState<Record<string, boolean>>({
    plan: true,
    extract: true,
    report: true,
  });

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
          Derived from persisted project data. Events that were not stored (such
          as rejected quotes or failed MCP lookups) are not invented here.
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
                            <span className="font-medium">{item.label}</span>
                            <span
                              className={`text-xs uppercase ${statusClass(item.status)}`}
                            >
                              {STATUS_LABEL[item.status]}
                            </span>
                          </div>
                          {item.detail ? (
                            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                              {item.detail}
                            </p>
                          ) : null}
                          {item.quote ? (
                            <p className="mt-2 text-zinc-500">
                              Quote: “{item.quote}”
                            </p>
                          ) : null}
                          {item.url ? (
                            <p className="mt-1 break-all text-zinc-500">
                              {item.url}
                            </p>
                          ) : null}
                          {item.toolName ? (
                            <p className="mt-1 text-xs text-zinc-500">
                              Tool: {item.toolName}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}

                  {stage.id === "extract" && trace.provenance.findings.length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Evidence provenance</h3>
                      <ul className="space-y-2">
                        {trace.provenance.findings.map((finding) => (
                          <li
                            key={finding.findingId}
                            className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                          >
                            <p>
                              <span className="font-medium">Claim:</span>{" "}
                              {finding.claim}
                            </p>
                            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                              <span className="font-medium">Quote:</span> “
                              {finding.quote}”
                            </p>
                            <p className="mt-1">
                              <span className="font-medium">Source:</span>{" "}
                              {finding.sourceTitle}
                            </p>
                            <p className="mt-1 break-all text-zinc-500">
                              {finding.sourceUrl}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              Tool: {finding.toolName ?? "unknown"}
                            </p>
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
                            <p className="font-medium">{citation.title}</p>
                            <p className="mt-1 break-all text-zinc-500">
                              {citation.url}
                            </p>
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
